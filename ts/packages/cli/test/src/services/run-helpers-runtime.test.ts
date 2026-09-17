import { Predicate } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRunHelpers } from 'src/services/run-helpers-runtime';

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

  it('[Given] normalized false flags [Then] nested CLI children receive false explicitly', async () => {
    vi.stubEnv('COMPOSIO_RUN_ENV_SENTINEL', 'forwarded');
    vi.stubEnv('COMPOSIO_PERF_DEBUG', '1');
    vi.stubEnv('COMPOSIO_TOOL_DEBUG', '1');
    vi.stubEnv('COMPOSIO_RUN_ACP_ONLY', '1');
    vi.stubEnv('BUN_BE_BUN', '1');

    const childScript = [
      'console.log(JSON.stringify({',
      '  successful: true,',
      '  data: {',
      '    sentinel: process.env.COMPOSIO_RUN_ENV_SENTINEL,',
      '    perfDebug: process.env.COMPOSIO_PERF_DEBUG,',
      '    toolDebug: process.env.COMPOSIO_TOOL_DEBUG,',
      '    acpOnly: process.env.COMPOSIO_RUN_ACP_ONLY,',
      '    bunBeBun: process.env.BUN_BE_BUN,',
      '  },',
      '}));',
    ].join('\n');

    await installRunHelpers({
      cliPrefix: [process.execPath, '-e', childScript],
      helperContext: { perfDebug: false, toolDebug: false, acpOnly: false },
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
        acpOnly: '0',
        bunBeBun: '',
      },
    });
  });

  it('[Given] a proxy response whose binary_data.url points at link-local space [Then] it refuses to fetch it', async () => {
    // A fresh Response per call — one body cannot be read twice.
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            session_id: 'session-1',
            binary_data: {
              url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
            },
            status: 200,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
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
    if (
      !Predicate.hasProperty(installedGlobals, 'proxy') ||
      typeof installedGlobals.proxy !== 'function'
    ) {
      throw new Error('installRunHelpers() did not install proxy().');
    }

    const proxyFetch = await installedGlobals.proxy('github');
    if (typeof proxyFetch !== 'function') {
      throw new Error('proxy() did not return a fetch function.');
    }

    await expect(proxyFetch('/user')).rejects.toThrow(/private, loopback, or link-local/);

    // Session create + proxy_execute only — the metadata endpoint was never dialled.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [target] of fetchMock.mock.calls) {
      expect(String(target)).not.toContain('169.254.169.254');
    }
  });
});
