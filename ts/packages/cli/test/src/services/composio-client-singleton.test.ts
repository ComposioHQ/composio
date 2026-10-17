import { afterEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Exit, Layer, Logger } from 'effect';
import { FetchHttpClient } from 'effect/http';
import * as tempy from 'tempy';
import { VERSION as clientLibraryVersion, type ComposioClientShape } from '@composio/client/effect';
import { ComposioClientSingleton, clientScopeKey } from 'src/services/composio-clients';
import { listActiveConnectedAccounts } from 'src/services/connected-account-selection';
import { stubComposioClient } from 'test/__utils__/services/stub-composio-client';
import { idempotent, validated } from 'src/services/composio-request';
import { APP_VERSION } from 'src/constants';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { withoutClientNotices } from 'src/effects/without-client-notices';

// Exercise real user-context/config resolution without opening the OS credential store.
vi.mock('@composio/cli-keyring/effect', async importOriginal => {
  const actual = await importOriginal<typeof import('@composio/cli-keyring/effect')>();
  const { Effect, Layer } = await import('effect');
  const { KeyringError } = await import('@composio/cli-keyring');
  return {
    ...actual,
    KeyringLiveWithBackend: () =>
      Layer.succeed(actual.KeyringService, {
        getPassword: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        getSecret: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        setPassword: () => Effect.die(new Error('Unexpected credential write')),
        setSecret: () => Effect.die(new Error('Unexpected credential write')),
        deleteCredential: () => Effect.die(new Error('Unexpected credential deletion')),
        isAvailable: Effect.succeed(true),
      }),
  };
});

const withConfigLayer = (map: Map<string, string>, homedir: string) =>
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir })),
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env: Object.fromEntries(map) })
    )
  );

const okResponse = () =>
  new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

// Mirrors the module-private `cwdHash` in src/services/consumer-short-term-cache.ts
// (djb2Hash + base36): the seeded cache key below must be byte-identical to what
// the service computes for process.cwd() when it looks up the CLI session.
const cwdHash = (cwd: string): string => {
  const hash = Array.from({ length: cwd.length }, (_, index) => cwd.charCodeAt(index)).reduce(
    (acc, code) => (acc * 33) ^ code,
    5381
  );
  return Math.abs(hash >>> 0).toString(36);
};

const writeCliSessionCache = (
  homedir: string,
  session: { readonly id: string; readonly expiresAt: string }
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cacheDir = path.join(homedir, '.composio');
    yield* fs.makeDirectory(cacheDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(cacheDir, 'consumer-short-term-cache.json'),
      JSON.stringify({
        test: {
          probablyMyCliSessionsByCwdHash: {
            [cwdHash(process.cwd())]: session,
          },
        },
      })
    );
  });

const listTools = (client: ComposioClientShape) =>
  client.tools.list({ limit: 1, toolkit_versions: 'latest' });

describe('ComposioClientSingleton headers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.effect('uses x-user-api-key and never x-api-key', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_from_user_env'],
      ['COMPOSIO_API_KEY', 'ak_should_be_ignored'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);

      expect(headers.get('x-user-api-key')).toBe('uak_from_user_env');
      expect(headers.has('x-api-key')).toBe(false);
      expect(headers.get('x-framework')).toBe('cli');
      expect(headers.get('x-source')).toBe('CLI');
      expect(headers.get('x-runtime')).toBe('NODEJS');
      expect(headers.get('x-sdk-version')).toBe(APP_VERSION);
      expect(headers.get('x-client-provenance')).toBe('@composio/cli');
      expect(headers.get('x-client-version')).toBe(APP_VERSION);
      expect(headers.get('x-client-language')).toBe('typescript');
      expect(headers.get('x-runtime-version')).toBe(process.versions.node);
      expect(headers.get('x-cli-session-id')).toBeNull();
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  // The session-id reader compares expiresAt against Clock.currentTimeMillis;
  // the TestClock sits at epoch 0, so fixed instants around it are
  // deterministically in the future or the past.
  it.effect('includes the current cwd CLI session ID', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_from_user_env'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    return Effect.gen(function* () {
      const path = yield* Path.Path;
      // The session-id reader resolves its cache dir from COMPOSIO_CACHE_DIR
      // (stubbed by the shared vitest setup) before falling back to homedir,
      // so point it at the directory this test writes the fixture into.
      vi.stubEnv('COMPOSIO_CACHE_DIR', path.join(homedir, '.composio'));
      yield* writeCliSessionCache(homedir, {
        id: 'cli_s_current',
        expiresAt: '1970-01-01T00:01:00.000Z',
      });
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-cli-session-id')).toBe('cli_s_current');
    }).pipe(
      Effect.provide(
        Layer.provideMerge(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('reads the cwd CLI session ID once for every client it builds', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(okResponse()));
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_from_user_env'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    return Effect.gen(function* () {
      const path = yield* Path.Path;
      vi.stubEnv('COMPOSIO_CACHE_DIR', path.join(homedir, '.composio'));
      yield* writeCliSessionCache(homedir, {
        id: 'cli_s_first',
        expiresAt: '1970-01-01T00:01:00.000Z',
      });
      const clientSingleton = yield* ComposioClientSingleton;
      yield* listTools(yield* clientSingleton.get());

      yield* writeCliSessionCache(homedir, {
        id: 'cli_s_second',
        expiresAt: '1970-01-01T00:01:00.000Z',
      });
      yield* listTools(
        yield* clientSingleton.getFor({ userApiKey: 'uak_other', orgId: 'o', projectId: 'p' })
      );

      const sessionIds = fetchSpy.mock.calls.map(call =>
        new Headers((call[1] as RequestInit).headers).get('x-cli-session-id')
      );
      expect(sessionIds).toEqual(['cli_s_first', 'cli_s_first']);
    }).pipe(
      Effect.provide(
        Layer.provideMerge(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('omits an expired cwd CLI session ID', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_from_user_env'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    return Effect.gen(function* () {
      const path = yield* Path.Path;
      vi.stubEnv('COMPOSIO_CACHE_DIR', path.join(homedir, '.composio'));
      yield* writeCliSessionCache(homedir, {
        id: 'cli_s_expired',
        expiresAt: '1969-12-31T23:59:00.000Z',
      });
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-cli-session-id')).toBeNull();
    }).pipe(
      Effect.provide(
        Layer.provideMerge(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('does not read COMPOSIO_API_KEY for user auth', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_API_KEY', 'ak_only'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);

      expect(headers.get('x-user-api-key')).toBeNull();
      expect(headers.has('x-api-key')).toBe(false);
      expect(headers.get('x-source')).toBe('CLI');
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('ignores ambient COMPOSIO_* variables and logs nothing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method =>
      vi.spyOn(console, method)
    );
    vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_ambient');
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_ambient');
    vi.stubEnv('COMPOSIO_CUSTOM_HEADERS', '{"x-extra":"1"}');
    vi.stubEnv('COMPOSIO_LOG_LEVEL', 'debug');
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([['COMPOSIO_BASE_URL', 'https://backend.composio.dev']]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.has('x-extra')).toBe(false);
      expect(headers.has('x-user-api-key')).toBe(false);
      expect(headers.has('x-api-key')).toBe(false);
      expect(consoleSpies.flatMap(spy => spy.mock.calls)).toEqual([]);
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('sends exactly one user credential when a user key is set', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_single'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      // The client authenticates with `Auth.user`, so the user key is its one
      // credential on every operation.
      yield* client.auth.session.retrieveInfo();

      const [input, init] = fetchSpy.mock.calls[0]!;
      expect(String(input)).toContain('/api/v3.1/auth/session/info');
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-user-api-key')).toBe('uak_single');
      expect(headers.has('x-api-key')).toBe(false);
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('supports an explicitly configured plain-HTTP backend without an extra opt-in', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_insecure'],
      ['COMPOSIO_BASE_URL', 'http://host.docker.internal:9900'],
    ]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [input, init] = fetchSpy.mock.calls[0]!;
      expect(String(input)).toContain('http://host.docker.internal:9900/');
      expect(new Headers((init as RequestInit).headers).get('x-user-api-key')).toBe('uak_insecure');
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('counts requests and response bytes, with or without Content-Length', () => {
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_metrics'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);
    const sized = (length: number) =>
      new Response(JSON.stringify({ data: [] }).padEnd(length, ' '), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(length) },
      });
    const unsized = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"items":[]}'));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      // Installed after the client exists: the counting fetch still resolves
      // `globalThis.fetch` per call.
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(sized(10))
        .mockResolvedValueOnce(sized(20))
        .mockResolvedValueOnce(unsized());
      yield* listTools(client);
      yield* listTools(client);
      expect(yield* clientSingleton.getMetrics()).toEqual({ requests: 2, byteSize: 30 });

      yield* listTools(client);
      expect(yield* clientSingleton.getMetrics()).toEqual({
        requests: 3,
        byteSize: 30 + '{"items":[]}'.length,
      });
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });
});

describe('ComposioClientSingleton client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const baseConfig = (entries: ReadonlyArray<readonly [string, string]> = []) =>
    new Map([['COMPOSIO_BASE_URL', 'https://backend.composio.dev'], ...entries]);

  const singletonLayer = (configMap: Map<string, string>) =>
    Layer.provide(
      ComposioClientSingleton.Default,
      withConfigLayer(configMap, tempy.temporaryDirectory())
    );

  const sentHeaders = (call: Parameters<typeof globalThis.fetch>) =>
    new Headers((call[1] as RequestInit).headers);

  it.effect('sends the scope credentials and the provenance headers, never x-api-key', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({
        userApiKey: 'uak_scope',
        orgId: 'org_a',
        projectId: 'proj_a',
      });
      yield* listTools(client);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const headers = sentHeaders(fetchSpy.mock.calls[0]!);

      expect(headers.get('x-user-api-key')).toBe('uak_scope');
      expect(headers.get('x-org-id')).toBe('org_a');
      expect(headers.get('x-project-id')).toBe('proj_a');
      expect(headers.has('x-api-key')).toBe(false);
      expect(headers.get('x-framework')).toBe('cli');
      expect(headers.get('x-source')).toBe('CLI');
      expect(headers.get('x-runtime')).toBe('NODEJS');
      expect(headers.get('x-client-runtime')).toBe('nodejs');
      expect(headers.get('x-runtime-version')).toBe(process.versions.node);
      expect(headers.get('x-sdk-version')).toBe(APP_VERSION);
      expect(headers.get('x-client-provenance')).toBe('@composio/cli');
      expect(headers.get('x-client-version')).toBe(APP_VERSION);
      expect(headers.get('x-client-language')).toBe('typescript');
      expect(headers.get('x-client-library')).toBe('@composio/client');
      expect(headers.get('x-client-library-version')).toBe(clientLibraryVersion);
    }).pipe(Effect.provide(singletonLayer(baseConfig())));
  });

  it.effect('rejects a scope with an org and no project, and would send neither header', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      // @ts-expect-error a scope names the org and the project together
      const client = yield* clientSingleton.getFor({ userApiKey: 'uak_scope', orgId: 'org_a' });
      yield* listTools(client);

      const headers = sentHeaders(fetchSpy.mock.calls[0]!);
      expect(headers.get('x-user-api-key')).toBe('uak_scope');
      expect(headers.has('x-org-id')).toBe(false);
      expect(headers.has('x-project-id')).toBe(false);
    }).pipe(Effect.provide(singletonLayer(baseConfig())));
  });

  it.effect('sends a project key in place of the user key, with the scope', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({
        projectApiKey: 'ak_project',
        orgId: 'org_a',
        projectId: 'proj_a',
      });
      yield* listTools(client);

      const headers = sentHeaders(fetchSpy.mock.calls[0]!);
      expect(headers.get('x-api-key')).toBe('ak_project');
      expect(headers.has('x-user-api-key')).toBe(false);
      expect(headers.get('x-org-id')).toBe('org_a');
      expect(headers.get('x-project-id')).toBe('proj_a');
    }).pipe(Effect.provide(singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_user']]))));
  });

  it.effect('refuses a request that names another org than its scope, before sending', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({
        userApiKey: 'uak_scope',
        orgId: 'org_a',
        projectId: 'proj_a',
      });
      const error = yield* Effect.flip(
        client.get('/api/v3/tools/X/get_latest_version', { headers: { 'x-org-id': 'org_b' } })
      );

      expect(error._tag).toBe('@composio/client/ConfigurationError');
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(Effect.provide(singletonLayer(baseConfig())));
  });

  it.effect('keys clients for a memo by credential, org, and project, never by instance', () =>
    Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const scope = { userApiKey: 'uak_a', orgId: 'org_a', projectId: 'proj_a' };

      const first = yield* clientSingleton.getFor(scope);
      const second = yield* clientSingleton.getFor(scope);
      const otherKey = yield* clientSingleton.getFor({ ...scope, userApiKey: 'uak_b' });
      const otherProject = yield* clientSingleton.getFor({ ...scope, projectId: 'proj_b' });
      const projectKey = yield* clientSingleton.getFor({
        projectApiKey: 'ak_a',
        orgId: 'org_a',
        projectId: 'proj_a',
      });
      const { client: elsewhere } = stubComposioClient(okResponse);

      expect(second).not.toBe(first);
      expect(clientScopeKey(second)).toBe(clientScopeKey(first));
      expect(clientScopeKey(otherKey)).not.toBe(clientScopeKey(first));
      expect(clientScopeKey(otherProject)).not.toBe(clientScopeKey(first));
      expect(clientScopeKey(projectKey)).not.toBe(clientScopeKey(first));
      expect(clientScopeKey(first)).not.toContain('uak_a');
      // A client built outside the singleton is keyed on its own.
      expect(clientScopeKey(elsewhere)).toBe(clientScopeKey(elsewhere));
      expect(clientScopeKey(elsewhere)).not.toBe(clientScopeKey(first));
    }).pipe(Effect.provide(singletonLayer(baseConfig())))
  );

  it.effect('lists active connected accounts once per credential, org, project, and user', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            total_items: 0,
            total_pages: 1,
            current_page: 1,
            next_cursor: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const scope = { orgId: 'org_a', projectId: 'proj_a' };

      // Two lookups of one scope hand back two instances; they share one fetch.
      yield* listActiveConnectedAccounts({
        client: yield* clientSingleton.getFor(scope),
        userId: 'user_1',
      });
      yield* listActiveConnectedAccounts({
        client: yield* clientSingleton.getFor(scope),
        userId: 'user_1',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      yield* listActiveConnectedAccounts({
        client: yield* clientSingleton.getFor({ ...scope, projectId: 'proj_b' }),
        userId: 'user_1',
      });
      yield* listActiveConnectedAccounts({
        client: yield* clientSingleton.getFor(scope),
        userId: 'user_2',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Another user key on the same scope never reads the first key's list.
      yield* listActiveConnectedAccounts({
        client: yield* clientSingleton.getFor({ ...scope, userApiKey: 'uak_other' }),
        userId: 'user_1',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    }).pipe(Effect.provide(singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_memo']]))));
  });

  it.effect('counts requests on its own transport beside an application FetchHttpClient', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({ userApiKey: 'uak_scope' });
      yield* listTools(client);

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect((yield* clientSingleton.getMetrics()).requests).toBe(1);
    }).pipe(
      // The application's transport is built first, so a memoized
      // `FetchHttpClient.layer` would be the one that counts nothing.
      Effect.provide(
        Layer.provide(
          ComposioClientSingleton.Default,
          Layer.merge(
            withConfigLayer(baseConfig(), tempy.temporaryDirectory()),
            FetchHttpClient.layer
          )
        )
      )
    );
  });

  it.effect('ignores ambient COMPOSIO_API_KEY and COMPOSIO_BASE_URL', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_ambient');
    vi.stubEnv('COMPOSIO_BASE_URL', 'https://ambient.invalid');

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.getFor({ userApiKey: 'uak_scope' });
      yield* listTools(client);

      const call = fetchSpy.mock.calls[0]!;
      expect(String(call[0])).toContain('https://backend.composio.dev/');
      const headers = sentHeaders(call);
      expect(headers.get('x-user-api-key')).toBe('uak_scope');
      expect(headers.has('x-api-key')).toBe(false);
    }).pipe(Effect.provide(singletonLayer(baseConfig())));
  });

  it.effect('resolves globalThis.fetch on every request', () => {
    const firstSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);
      expect(firstSpy).toHaveBeenCalledOnce();

      firstSpy.mockRestore();
      const secondSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
      yield* listTools(client);

      expect(secondSpy).toHaveBeenCalledOnce();
    }).pipe(Effect.provide(singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_late']]))));
  });

  // Live clock: the retry backoff is a real sleep, cut to nothing by the
  // `retry-after-ms` response header.
  it.live('counts every attempt of a retried call', () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'retry-after-ms': '0' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(['GITHUB_CREATE_ISSUE']), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();

      expect(yield* client.tools.retrieveEnum(idempotent)).toEqual(['GITHUB_CREATE_ISSUE']);
      expect((yield* clientSingleton.getMetrics()).requests).toBe(2);
    }).pipe(Effect.provide(singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_retry']]))));
  });

  it.effect('sends a call that is not marked idempotent once', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('{}', {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'retry-after-ms': '0' },
        })
      )
    );

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      const error = yield* Effect.flip(
        client.triggerInstances.manage.update('ti_1', { status: 'enable' })
      );

      expect(error._tag).toBe('@composio/client/InternalServerError');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_once']]))));
  });

  it.effect('counts requests when the application already provides a fetch transport', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      expect((yield* clientSingleton.getMetrics()).requests).toBe(1);
    }).pipe(
      Effect.provide(
        Layer.provide(
          ComposioClientSingleton.Default,
          Layer.mergeAll(
            withConfigLayer(
              baseConfig([['COMPOSIO_USER_API_KEY', 'uak_metrics']]),
              tempy.temporaryDirectory()
            ),
            FetchHttpClient.layer
          )
        )
      )
    );
  });

  it.effect('drops the deprecation notice the client logs at the CLI logger', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Deprecation: 'true',
          Sunset: 'Wed, 31 Dec 2027 23:59:59 GMT',
          Link: '<https://docs.composio.dev/migration>; rel="deprecation"',
        },
      })
    );
    const logged: Array<unknown> = [];
    const shown: Array<unknown> = [];
    const recordInto = (records: Array<unknown>) =>
      Logger.make<unknown, void>(({ message }) => {
        records.push(message);
      });
    const capturingLogger = Logger.layer([
      recordInto(logged),
      withoutClientNotices(recordInto(shown)),
    ]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      yield* listTools(client);

      expect(logged).toHaveLength(1);
      expect(shown).toEqual([]);
    }).pipe(
      Effect.provide(
        Layer.merge(
          singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_quiet']])),
          capturingLogger
        )
      )
    );
  });

  it.effect('validates a response only for a call that asks for it', () => {
    // `okResponse` is not a toolkits page.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(okResponse()));

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();

      const lenient = yield* Effect.exit(client.toolkits.list({ limit: 1 }));
      const strict = yield* Effect.flip(client.toolkits.list({ limit: 1 }, validated));

      expect(Exit.isSuccess(lenient)).toBe(true);
      expect(strict._tag).toBe('@composio/client/DecodeError');
    }).pipe(Effect.provide(singletonLayer(baseConfig([['COMPOSIO_USER_API_KEY', 'uak_strict']]))));
  });

  it.effect("reports an invalid base URL as the client's own configuration error", () =>
    Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const error = yield* Effect.flip(clientSingleton.getFor({ userApiKey: 'uak_a' }));

      expect(error._tag).toBe('@composio/client/ConfigurationError');
    }).pipe(Effect.provide(singletonLayer(new Map([['COMPOSIO_BASE_URL', 'not a url']]))))
  );

  it.effect('does not keep a client that could not be built', () =>
    Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const scope = { userApiKey: 'uak_a' };

      const first = yield* Effect.flip(clientSingleton.getFor(scope));
      const second = yield* Effect.flip(clientSingleton.getFor(scope));

      expect(first._tag).toBe('@composio/client/ConfigurationError');
      expect(second).not.toBe(first);
    }).pipe(Effect.provide(singletonLayer(new Map([['COMPOSIO_BASE_URL', 'not a url']]))))
  );
});
