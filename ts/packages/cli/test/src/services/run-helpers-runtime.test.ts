import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { inspect } from 'node:util';
import { Predicate } from 'effect';
import { isBlockedSensitiveFileUploadPath } from '@composio/core';
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
  assert(typeof value === 'function', `installRunHelpers() did not install ${name}().`);
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
    installedGlobalNames.forEach(name => {
      const descriptor = originalGlobalDescriptors.get(name);
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    });
  });

  it('[Given] installed helpers [Then] every documented global is defined', async () => {
    await installRunHelpers({ cliPrefix: ['composio'] });

    const helperNames = ['execute', 'search', 'proxy', 'experimental_subAgent', 'invokeAgent'];
    expect(helperNames.map(name => typeof Reflect.get(globalThis, name))).toEqual(
      helperNames.map(() => 'function')
    );
    expect(Reflect.get(globalThis, 'z')).toBeDefined();
    expect(Reflect.get(globalThis, 'zod')).toBe(Reflect.get(globalThis, 'z'));
  });

  it('[Given] experimental_subAgent or invokeAgent [Then] both reject with the same removal message and alternative', async () => {
    await installRunHelpers({ cliPrefix: ['composio'] });

    const [subAgent, invokeAgent] = await Promise.allSettled([
      readInstalledFunction('experimental_subAgent')('p'),
      readInstalledFunction('invokeAgent')('p'),
    ]);

    assert(subAgent?.status === 'rejected' && subAgent.reason instanceof Error);
    expect(subAgent.reason.message).toContain('removed');
    expect(subAgent.reason.message).toContain('automatically approved permission requests');
    expect(subAgent.reason.message).toContain('let the calling agent summarize');
    expect(invokeAgent).toMatchObject({
      status: 'rejected',
      reason: { message: subAgent.reason.message },
    });
  });

  it.each([
    { name: 'no arguments', args: [] },
    { name: 'a prompt and options', args: ['p', { target: 'codex' }] },
    { name: 'arbitrary extra arguments', args: [42, null, 'extra'] },
  ])('[Given] $name [Then] experimental_subAgent rejects instead of throwing', async ({ args }) => {
    await installRunHelpers({ cliPrefix: ['composio'] });

    const returned = readInstalledFunction('experimental_subAgent')(...args);

    expect(returned).toBeInstanceOf(Promise);
    await expect(returned).rejects.toThrow(/removed/);
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
    assert(
      Predicate.hasProperty(installedGlobals, 'proxy') &&
        typeof installedGlobals.proxy === 'function',
      'installRunHelpers() did not install proxy().'
    );

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
    assert(
      Predicate.hasProperty(installedGlobals, 'proxy') &&
        typeof installedGlobals.proxy === 'function',
      'installRunHelpers() did not install proxy().'
    );

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
    assert(
      Predicate.hasProperty(installedGlobals, 'proxy') &&
        typeof installedGlobals.proxy === 'function',
      'installRunHelpers() did not install proxy().'
    );

    const proxyFetch = await installedGlobals.proxy('github');
    await expect(proxyFetch('https://api.github.com/user')).rejects.toMatchObject({
      code: 'TS-SDK::BLOCKED_INTERNAL_URL',
      name: 'ComposioBlockedInternalUrlError',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('[Given] `composio execute` exits 1 with a failed result [Then] execute() rejects with the result error', async () => {
    const childScript = [
      'console.log(JSON.stringify({ successful: false, data: {}, error: "User not found" }));',
      'process.exit(1);',
    ].join('\n');
    await installRunHelpers({ cliPrefix: [process.execPath, '-e', childScript] });

    const returned = readInstalledFunction('execute')('HACKERNEWS_GET_USER', {
      username: 'nobody',
    });

    await expect(returned).rejects.toBeInstanceOf(Error);
    await expect(returned).rejects.toMatchObject({
      message: 'User not found',
      slug: 'HACKERNEWS_GET_USER',
      result: { successful: false, error: 'User not found' },
    });
  });

  it('[Given] file labels larger than the Linux environment limit [Then] the child reads all labels from a temporary manifest', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-batch-'));
    const childScript = [
      'const fs = require("node:fs");',
      'const manifestPath = process.env.COMPOSIO_RUN_STAGED_FILES_FILE;',
      'const manifest = fs.readFileSync(manifestPath, "utf8");',
      'const labels = JSON.parse(manifest);',
      'const input = process.argv[process.argv.indexOf("--data") + 1];',
      'const data = JSON.parse(fs.readFileSync(input.slice(1), "utf8"));',
      'console.log(JSON.stringify({ successful: true, data: { manifestPath, manifestBytes: Buffer.byteLength(manifest), mode: fs.statSync(manifestPath).mode & 0o777, count: Object.keys(labels).length, dataCount: data.files.length, first: labels[data.files[0]], last: labels[data.files.at(-1)] } }));',
    ].join('\n');
    const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const fileName = (i: number) => `${i}-${'a'.repeat(200)}.pptx`;
    try {
      await installRunHelpers({
        cliPrefix: [process.execPath, '-e', childScript],
        helperContext: { runOutputDir: outputDir },
      });
      const result = await readInstalledFunction('execute')('TEST_UPLOAD', {
        files: Array.from(
          { length: 512 },
          (_, i) => new File(['PK'], fileName(i), { type: mimeType })
        ),
      });
      assert(
        Predicate.hasProperty(result, 'data') &&
          Predicate.hasProperty(result.data, 'manifestPath') &&
          typeof result.data.manifestPath === 'string'
      );
      expect(result.data).toMatchObject({
        count: 512,
        dataCount: 512,
        mode: 0o600,
        first: { name: fileName(0), mimetype: mimeType },
        last: { name: fileName(511), mimetype: mimeType },
      });
      assert(
        Predicate.hasProperty(result.data, 'manifestBytes') &&
          typeof result.data.manifestBytes === 'number'
      );
      expect(result.data.manifestBytes).toBeGreaterThan(128 * 1024);
      expect(Buffer.byteLength(result.data.manifestPath)).toBeLessThan(1024);
      expect(fs.existsSync(result.data.manifestPath)).toBe(false);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it.each([true, false])(
    '[Given] a child fails with JSON result=%s [Then] its metadata is removed',
    async reportsResult => {
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-failure-'));
      const observedPath = path.join(outputDir, 'observed-manifest');
      const childScript = [
        'const fs = require("node:fs");',
        `fs.writeFileSync(${JSON.stringify(observedPath)}, process.env.COMPOSIO_RUN_STAGED_FILES_FILE);`,
        ...(reportsResult
          ? ['console.log(JSON.stringify({ successful: false, error: "refused" }));']
          : []),
        'process.exit(1);',
      ].join('\n');
      try {
        await installRunHelpers({ cliPrefix: [process.execPath, '-e', childScript] });
        await expect(
          readInstalledFunction('execute')('TEST_UPLOAD', { file: new File(['x'], 'x.txt') })
        ).rejects.toBeInstanceOf(Error);
        const manifestPath = fs.readFileSync(observedPath, 'utf8');
        expect(fs.existsSync(path.dirname(manifestPath))).toBe(false);
      } finally {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    }
  );

  it('[Given] a stale inherited metadata path and no Files [Then] the child receives no metadata path', async () => {
    vi.stubEnv('COMPOSIO_RUN_STAGED_FILES_FILE', '/stale/metadata.json');
    const childScript =
      'console.log(JSON.stringify({ successful: true, data: { manifestPath: process.env.COMPOSIO_RUN_STAGED_FILES_FILE } }));';
    await installRunHelpers({ cliPrefix: [process.execPath, '-e', childScript] });
    expect(await readInstalledFunction('execute')('TEST_UPLOAD', { text: 'plain' })).toMatchObject({
      data: { manifestPath: '' },
    });
  });

  it("[Given] File and Blob arguments [Then] the spawned `composio execute` gets generated paths, and each one's own name and type beside them", async () => {
    // Echoes the `--data` JSON and the staged files it was spawned with, and
    // whether each staged file exists.
    const childScript = [
      'const fs = require("node:fs");',
      'const data = JSON.parse(process.argv[process.argv.indexOf("--data") + 1]);',
      'const stagedFiles = JSON.parse(fs.readFileSync(process.env.COMPOSIO_RUN_STAGED_FILES_FILE, "utf8"));',
      'const exists = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fs.existsSync(v)]));',
      'console.log(JSON.stringify({ successful: true, data: { data, stagedFiles, exists } }));',
    ].join('\n');
    // A value the run process inherited must not reach the child.
    vi.stubEnv('COMPOSIO_RUN_STAGED_FILES_FILE', '/stale/metadata.json');
    await installRunHelpers({ cliPrefix: [process.execPath, '-e', childScript] });
    const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    const result = await readInstalledFunction('execute')('CANVA_CREATE_DESIGN_IMPORT_JOB', {
      named: new File(['PK'], 'deck.pptx', { type: PPTX }),
      sameName: new File(['PK'], 'deck.pptx', { type: PPTX }),
      extensionless: new File(['PK'], 'deck', { type: PPTX }),
      traversal: new File(['PK'], '../escape.pptx', { type: PPTX }),
      untyped: new File(['hi'], 'notes.txt'),
      envExample: new File(['EXAMPLE=value'], '.env.example', { type: 'text/plain' }),
      privateKeyName: new File(['not a key'], 'keys/id_rsa'),
      blob: new Blob(['PK'], { type: PPTX }),
    });

    assert(
      Predicate.hasProperty(result, 'data') &&
        Predicate.hasProperty(result.data, 'data') &&
        Predicate.isObject(result.data.data) &&
        Predicate.hasProperty(result.data, 'stagedFiles')
    );
    const staged = result.data.data;
    const stagedPaths = Object.values(staged).map(String);
    // Every File is staged under a generated name, with its extension when it has one…
    expect(stagedPaths.map(stagedPath => path.basename(stagedPath))).toEqual([
      expect.stringMatching(/^file-[0-9a-f]{8}\.pptx$/),
      expect.stringMatching(/^file-[0-9a-f]{8}\.pptx$/),
      expect.stringMatching(/^file-[0-9a-f]{8}$/),
      expect.stringMatching(/^file-[0-9a-f]{8}\.pptx$/),
      expect.stringMatching(/^file-[0-9a-f]{8}\.txt$/),
      expect.stringMatching(/^file-[0-9a-f]{8}\.example$/),
      expect.stringMatching(/^file-[0-9a-f]{8}$/),
      expect.stringMatching(/^file-[0-9a-f]{8}\.bin$/),
    ]);
    // …that the child's denylist does not refuse, and that two Files with one name do not share.
    expect(stagedPaths.filter(stagedPath => isBlockedSensitiveFileUploadPath(stagedPath))).toEqual(
      []
    );
    expect(new Set(stagedPaths).size).toBe(stagedPaths.length);
    expect(result.data).toMatchObject({
      exists: Object.fromEntries(Object.keys(staged).map(key => [key, true])),
    });
    // The child uploads each one under its own name and type.
    expect(result.data.stagedFiles).toEqual({
      [String(staged.named)]: { name: 'deck.pptx', mimetype: PPTX },
      [String(staged.sameName)]: { name: 'deck.pptx', mimetype: PPTX },
      [String(staged.extensionless)]: { name: 'deck', mimetype: PPTX },
      [String(staged.traversal)]: { name: 'escape.pptx', mimetype: PPTX },
      [String(staged.untyped)]: { name: 'notes.txt' },
      [String(staged.envExample)]: { name: '.env.example', mimetype: 'text/plain' },
      [String(staged.privateKeyName)]: { name: 'id_rsa' },
      [String(staged.blob)]: {
        name: expect.stringMatching(/^file-[0-9a-f]{8}\.bin$/),
        mimetype: PPTX,
      },
    });
  });

  it('[Given] a CLI child exits non-zero without a failed result [Then] the helper rejects with the exit code', async () => {
    const childScript = ['console.error("boom");', 'process.exit(2);'].join('\n');
    await installRunHelpers({ cliPrefix: [process.execPath, '-e', childScript] });

    await expect(readInstalledFunction('search')('test')).rejects.toMatchObject({
      message: expect.stringContaining('failed with exit code 2'),
      exitCode: 2,
      stderr: 'boom',
    });
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
    assert(
      Predicate.hasProperty(installedGlobals, 'search') &&
        typeof installedGlobals.search === 'function',
      'installRunHelpers() did not install search().'
    );

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
