import { afterEach, beforeAll, describe, expect, it, vi } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { execSync } from 'node:child_process';
import * as tempy from 'tempy';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ComposioUserContext, ComposioUserContextLive } from 'src/services/user-context';
import { AuthRejectionRecorder } from 'src/services/auth-rejection';
import { userApiKeyRejectionResponse } from 'test/__utils__/models/user-api-key-rejection';
import { APP_VERSION, STAGING_BASE_URL, STAGING_WEB_URL } from 'src/constants';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { extendConfigProvider } from 'src/services/config';

const withConfigLayer = (map: Map<string, string>, homedir: string) =>
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir })),
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      extendConfigProvider(ConfigProvider.fromEnv({ env: Object.fromEntries(map) }))
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
  let hash = 5381;
  for (let index = 0; index < cwd.length; index += 1) {
    hash = (hash * 33) ^ cwd.charCodeAt(index);
  }
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

describe('ComposioClientSingleton headers', () => {
  // Delete any real keychain entry so the subprocess keyring read
  // inside ComposioUserContextLive (baked into
  // ComposioClientSingleton.Default's dependencies) finds nothing
  // and apiKey resolves to Option.none(). Without this, the test
  // picks up real credentials and assertions on x-user-api-key fail.
  beforeAll(() => {
    try {
      execSync(
        '/usr/bin/security delete-generic-password -s com.composio.cli -a default 2>/dev/null',
        { stdio: 'ignore' }
      );
    } catch {
      // Entry may not exist — fine.
    }
  });

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
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);

      expect(headers.get('x-user-api-key')).toBe('uak_from_user_env');
      expect(headers.has('x-api-key')).toBe(false);
      expect(headers.get('x-framework')).toBe('cli');
      expect(headers.get('x-source')).toBe('CLI');
      expect(headers.get('x-runtime')).toBe('NODEJS');
      expect(headers.get('x-sdk-version')).toBe(APP_VERSION);
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
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-cli-session-id')).toBe('cli_s_current');
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
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );

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
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );

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

  it.effect('builds a new client when the backend changes for the same key', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(okResponse()));
    const homedir = tempy.temporaryDirectory();
    const requestedHost = (call: number) => new URL(String(fetchSpy.mock.calls[call]![0])).host;
    const listTools = (client: { tools: { list: (params: object) => Promise<unknown> } }) =>
      Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cacheDir = path.join(homedir, '.composio');
      yield* fs.makeDirectory(cacheDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(cacheDir, 'user_data.json'),
        JSON.stringify({
          api_key: 'uak_same',
          base_url: STAGING_BASE_URL,
          web_url: STAGING_WEB_URL,
        })
      );

      yield* Effect.gen(function* () {
        const ctx = yield* ComposioUserContext;
        const clientSingleton = yield* ComposioClientSingleton;

        const stagingClient = yield* clientSingleton.get();
        yield* listTools(stagingClient);
        yield* ctx.login({ apiKey: 'uak_same', target: ctx.backend.ambient });
        const productionClient = yield* clientSingleton.get();
        yield* listTools(productionClient);

        expect(productionClient).not.toBe(stagingClient);
        expect(requestedHost(0)).toBe(new URL(STAGING_BASE_URL).host);
        expect(requestedHost(1)).toBe('backend.composio.dev');
      }).pipe(
        Effect.provide(
          ComposioClientSingleton.layer.pipe(
            Layer.provideMerge(AuthRejectionRecorder.Default),
            Layer.provideMerge(ComposioUserContextLive),
            Layer.provideMerge(withConfigLayer(new Map(), homedir))
          )
        )
      );
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)));
  });
});

describe('ComposioClientSingleton rejection recording', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const listTools = (client: { tools: { list: (params: object) => Promise<unknown> } }) =>
    Effect.promise(() =>
      client.tools
        .list({ limit: 1, toolkit_versions: 'latest' })
        .then(() => undefined)
        .catch(() => undefined)
    );

  // Runs `body` with a stored staging login and the recorder in scope.
  const withStoredStagingLogin = <A, E>(
    body: Effect.Effect<A, E, ComposioClientSingleton | AuthRejectionRecorder>
  ) => {
    const homedir = tempy.temporaryDirectory();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cacheDir = path.join(homedir, '.composio');
      yield* fs.makeDirectory(cacheDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(cacheDir, 'user_data.json'),
        JSON.stringify({
          api_key: 'uak_revoked',
          base_url: STAGING_BASE_URL,
          web_url: STAGING_WEB_URL,
        })
      );
      return yield* body.pipe(
        Effect.provide(
          ComposioClientSingleton.layer.pipe(
            Layer.provideMerge(AuthRejectionRecorder.Default),
            Layer.provide(ComposioUserContextLive),
            Layer.provide(withConfigLayer(new Map(), homedir))
          )
        )
      );
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)));
  };

  it.effect(
    '[Given] the backend rejects the stored key [Then] records the rejecting host once',
    () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(userApiKeyRejectionResponse())
      );

      return withStoredStagingLogin(
        Effect.gen(function* () {
          const client = yield* Effect.flatMap(ComposioClientSingleton, singleton =>
            singleton.get()
          );
          yield* Effect.all([listTools(client), listTools(client)], { concurrency: 'unbounded' });

          const recorder = yield* AuthRejectionRecorder;
          expect(yield* recorder.first).toEqual(
            Option.some({ baseURL: STAGING_BASE_URL, keySource: 'stored' })
          );
        })
      );
    }
  );

  it.effect('[Given] a successful response [Then] records nothing', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(okResponse()));

    return withStoredStagingLogin(
      Effect.gen(function* () {
        const client = yield* Effect.flatMap(ComposioClientSingleton, singleton => singleton.get());
        yield* listTools(client);

        const recorder = yield* AuthRejectionRecorder;
        expect(Option.isNone(yield* recorder.first)).toBe(true);
      })
    );
  });

  it.effect('[Given] an anonymous login client [Then] a rejection is not recorded', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(userApiKeyRejectionResponse()));

    return withStoredStagingLogin(
      Effect.gen(function* () {
        const client = yield* Effect.flatMap(ComposioClientSingleton, singleton =>
          singleton.getFor({ baseURL: 'https://backend.composio.dev', anonymous: true })
        );
        yield* listTools(client);

        const [, init] = fetchSpy.mock.calls[0]!;
        expect(new Headers((init as RequestInit).headers).get('x-user-api-key')).toBeNull();
        const recorder = yield* AuthRejectionRecorder;
        expect(Option.isNone(yield* recorder.first)).toBe(true);
      })
    );
  });
});
