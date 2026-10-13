import { inspect } from 'node:util';
import { Predicate } from 'effect';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import { installRunHelpers, parseJson } from 'src/services/run-helpers-runtime';
import { ToolInputRequiredError } from 'src/utils/tool-input-required';

const installedGlobalNames = [
  'z',
  'zod',
  'search',
  'execute',
  'experimental_subAgent',
  'invokeAgent',
  'proxy',
  '__composioRunContext',
  '__composioConsumerContext',
];
const originalGlobalDescriptors = new Map(
  installedGlobalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
);

const readInstalledFunction = (name: string): ((...args: ReadonlyArray<unknown>) => unknown) => {
  const value: unknown = Reflect.get(globalThis, name);
  if (typeof value !== 'function') {
    throw new Error(`installRunHelpers() did not install ${name}().`);
  }
  return (...args) => Reflect.apply(value, undefined, [...args]);
};

describe('parseJson', () => {
  it('[Given] blank text [Then] returns undefined', () => {
    expect(parseJson('   ')).toBeUndefined();
  });

  it('[Given] valid JSON [Then] returns the parsed value', () => {
    expect(parseJson(' {"a": 1} ')).toEqual({ a: 1 });
    expect(parseJson('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(parseJson('null')).toBeNull();
  });

  it('[Given] non-JSON text [Then] returns the trimmed text verbatim', () => {
    expect(parseJson('  not json at all  ')).toBe('not json at all');
  });
});

describe('run-helpers-runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of installedGlobalNames) {
      const descriptor = originalGlobalDescriptors.get(name);
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it('[Given] installed helpers [Then] every documented global is defined', async () => {
    await installRunHelpers({ cliPrefix: ['composio'] });

    for (const name of ['execute', 'search', 'proxy', 'experimental_subAgent', 'invokeAgent']) {
      expect(typeof Reflect.get(globalThis, name)).toBe('function');
    }
    expect(Reflect.get(globalThis, 'z')).toBeDefined();
    expect(Reflect.get(globalThis, 'zod')).toBe(Reflect.get(globalThis, 'z'));
  });

  it('[Given] experimental_subAgent or invokeAgent [Then] both reject with the same removal message and alternative', async () => {
    await installRunHelpers({ cliPrefix: ['composio'] });

    const outcomes = await Promise.allSettled([
      readInstalledFunction('experimental_subAgent')('p'),
      readInstalledFunction('invokeAgent')('p'),
    ]);

    const messages = outcomes.map(outcome =>
      outcome.status === 'rejected' && outcome.reason instanceof Error
        ? outcome.reason.message
        : undefined
    );
    expect(outcomes.map(outcome => outcome.status)).toEqual(['rejected', 'rejected']);
    expect(messages[0]).toContain('removed');
    expect(messages[0]).toContain('automatically approved permission requests');
    expect(messages[0]).toContain('let the calling agent summarize');
    expect(messages[1]).toBe(messages[0]);
  });

  it('[Given] any arguments, including none [Then] experimental_subAgent rejects instead of throwing', async () => {
    await installRunHelpers({ cliPrefix: ['composio'] });
    const subAgent = readInstalledFunction('experimental_subAgent');

    for (const args of [[], ['p', { target: 'codex' }], [42, null, 'extra']]) {
      const returned = subAgent(...args);
      expect(returned).toBeInstanceOf(Promise);
      await expect(returned).rejects.toThrow(/removed/);
    }
  });

  it('[Given] a malformed proxy session response [Then] it rejects the HTTP boundary payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_id: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await installRunHelpers({
      cliPrefix: ['composio'],
      helperContext: {
        apiKey: 'test-key',
        orgId: 'test-org',
        consumerProjectId: 'test-project',
        consumerUserId: 'test-user',
      },
    });

    const installedGlobals: unknown = globalThis;
    expect(Predicate.hasProperty(installedGlobals, 'proxy')).toBe(true);
    if (
      !Predicate.hasProperty(installedGlobals, 'proxy') ||
      typeof installedGlobals.proxy !== 'function'
    ) {
      throw new Error('installRunHelpers() did not install proxy().');
    }

    await expect(installedGlobals.proxy('github')).rejects.toThrow(/session_id/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('[Given] a proxy call that needs user input [Then] it rejects instead of returning an empty 200', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session_id: 'session-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result_type: 'input_required',
            input_requests: {
              approval_1: {
                type: 'elicitation',
                mode: 'form',
                message: 'Allow this request to GitHub?',
                requested_schema: { type: 'object' },
              },
            },
            request_state: 'opaque-state-token',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await installRunHelpers({
      cliPrefix: ['composio'],
      helperContext: {
        apiKey: 'test-key',
        orgId: 'test-org',
        consumerProjectId: 'test-project',
        consumerUserId: 'test-user',
      },
    });

    const installedGlobals: unknown = globalThis;
    assert(
      Predicate.hasProperty(installedGlobals, 'proxy') &&
        typeof installedGlobals.proxy === 'function',
      'installRunHelpers() did not install proxy().'
    );

    const proxyFetch = await installedGlobals.proxy('github');
    const error: unknown = await proxyFetch('https://api.github.com/user/repos', {
      method: 'POST',
    }).catch((caught: unknown) => caught);

    assert(error instanceof ToolInputRequiredError);
    expect(error.message).toBe(
      'POST proxy call via "github" requires user input before it can run (1 input request) and was not executed. The CLI cannot answer input requests yet.'
    );
    // The script is likely to log the error whole, so the continuation state
    // is not on it.
    expect(inspect(error, { depth: null })).not.toContain('opaque-state-token');
    expect(JSON.stringify(error)).not.toContain('opaque-state-token');
    expect(Object.keys(error.inputRequests)).toEqual(['approval_1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'a completed answer',
      body: { result_type: 'completed', status: 201, data: { id: 1 } },
    },
    { name: 'an answer with no result_type', body: { status: 201, data: { id: 1 } } },
  ])('[Given] $name from the proxy [Then] it returns the proxied response', async ({ body }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session_id: 'session-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await installRunHelpers({
      cliPrefix: ['composio'],
      helperContext: {
        apiKey: 'test-key',
        orgId: 'test-org',
        consumerProjectId: 'test-project',
        consumerUserId: 'test-user',
      },
    });

    const installedGlobals: unknown = globalThis;
    assert(
      Predicate.hasProperty(installedGlobals, 'proxy') &&
        typeof installedGlobals.proxy === 'function',
      'installRunHelpers() did not install proxy().'
    );

    const proxyFetch = await installedGlobals.proxy('github');
    const response: Response = await proxyFetch('https://api.github.com/user');

    expect(response.status).toBe(201);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it('[Given] a proxy binary URL targets cloud metadata [Then] it blocks the download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session_id: 'session-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            binary_data: {
              url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
            },
            status: 200,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(new Response('stolen cloud credentials', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await installRunHelpers({
      cliPrefix: ['composio'],
      helperContext: {
        apiKey: 'test-key',
        orgId: 'test-org',
        consumerProjectId: 'test-project',
        consumerUserId: 'test-user',
      },
    });

    const installedGlobals: unknown = globalThis;
    expect(Predicate.hasProperty(installedGlobals, 'proxy')).toBe(true);
    if (
      !Predicate.hasProperty(installedGlobals, 'proxy') ||
      typeof installedGlobals.proxy !== 'function'
    ) {
      throw new Error('installRunHelpers() did not install proxy().');
    }

    const proxyFetch = await installedGlobals.proxy('github');
    await expect(proxyFetch('https://api.github.com/user')).rejects.toMatchObject({
      code: 'TS-SDK::BLOCKED_INTERNAL_URL',
      name: 'ComposioBlockedInternalUrlError',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('[Given] a configured proxy prevents pinning [Then] it blocks the binary download', async () => {
    vi.stubEnv('NODE_USE_ENV_PROXY', '1');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example:3128');
    vi.stubEnv('NO_PROXY', '');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session_id: 'session-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            binary_data: { url: 'https://1.1.1.1/proxy-response.bin' },
            status: 200,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(new Response('untrusted proxied response', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await installRunHelpers({
      cliPrefix: ['composio'],
      helperContext: {
        apiKey: 'test-key',
        orgId: 'test-org',
        consumerProjectId: 'test-project',
        consumerUserId: 'test-user',
      },
    });

    const installedGlobals: unknown = globalThis;
    expect(Predicate.hasProperty(installedGlobals, 'proxy')).toBe(true);
    if (
      !Predicate.hasProperty(installedGlobals, 'proxy') ||
      typeof installedGlobals.proxy !== 'function'
    ) {
      throw new Error('installRunHelpers() did not install proxy().');
    }

    const proxyFetch = await installedGlobals.proxy('github');
    await expect(proxyFetch('https://api.github.com/user')).rejects.toMatchObject({
      code: 'TS-SDK::BLOCKED_INTERNAL_URL',
      name: 'ComposioBlockedInternalUrlError',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('[Given] normalized false flags [Then] nested CLI children receive false explicitly', async () => {
    vi.stubEnv('COMPOSIO_RUN_ENV_SENTINEL', 'forwarded');
    vi.stubEnv('COMPOSIO_PERF_DEBUG', '1');
    vi.stubEnv('COMPOSIO_TOOL_DEBUG', '1');
    vi.stubEnv('BUN_BE_BUN', '1');

    const childScript = [
      'console.log(JSON.stringify({',
      '  successful: true,',
      '  data: {',
      '    sentinel: process.env.COMPOSIO_RUN_ENV_SENTINEL,',
      '    perfDebug: process.env.COMPOSIO_PERF_DEBUG,',
      '    toolDebug: process.env.COMPOSIO_TOOL_DEBUG,',
      '    bunBeBun: process.env.BUN_BE_BUN,',
      '  },',
      '}));',
    ].join('\n');

    await installRunHelpers({
      cliPrefix: [process.execPath, '-e', childScript],
      helperContext: { perfDebug: false, toolDebug: false },
    });

    const installedGlobals: unknown = globalThis;
    expect(Predicate.hasProperty(installedGlobals, 'search')).toBe(true);
    if (
      !Predicate.hasProperty(installedGlobals, 'search') ||
      typeof installedGlobals.search !== 'function'
    ) {
      throw new Error('installRunHelpers() did not install search().');
    }

    await expect(installedGlobals.search('test')).resolves.toMatchObject({
      successful: true,
      data: {
        sentinel: 'forwarded',
        perfDebug: '0',
        toolDebug: '0',
        bunBeBun: '',
      },
    });
  });
});
