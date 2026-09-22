import { afterEach, beforeAll, describe, expect, it, vi } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Layer } from 'effect';
import { execSync } from 'node:child_process';
import * as tempy from 'tempy';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { APP_VERSION } from 'src/constants';
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
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.has('x-extra')).toBe(false);
      expect(headers.has('x-user-api-key')).toBe(false);
      expect(headers.has('x-api-key')).toBe(false);
      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
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
      // `auth.session.retrieveInfo` is an operation where the client would
      // attach its own `userApiKey` credential; the caller-placed header wins.
      yield* Effect.promise(() =>
        client.auth.session
          .retrieveInfo()
          .then(() => undefined)
          .catch(() => undefined)
      );

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

  it.effect('refuses a credentialed plain-HTTP origin unless the user opts in', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_insecure'],
      ['COMPOSIO_BASE_URL', 'http://host.docker.internal:9900'],
    ]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const error = yield* clientSingleton.get().pipe(Effect.flip);

      expect(error._tag).toBe('services/ComposioClientConfigurationError');
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('sends the credential to a plain-HTTP origin with COMPOSIO_ALLOW_INSECURE_HTTP', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_insecure'],
      ['COMPOSIO_BASE_URL', 'http://host.docker.internal:9900'],
      ['COMPOSIO_ALLOW_INSECURE_HTTP', '1'],
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

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(new Headers((init as RequestInit).headers).get('x-user-api-key')).toBe('uak_insecure');
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );
  });

  it.effect('caches one client per key, org, and project', () => {
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([['COMPOSIO_BASE_URL', 'https://backend.composio.dev']]);

    return Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;
      const scope = { userApiKey: 'uak_a', orgId: 'org_a', projectId: 'proj_a' };

      const first = yield* clientSingleton.getFor(scope);
      const second = yield* clientSingleton.getFor(scope);
      const otherProject = yield* clientSingleton.getFor({ ...scope, projectId: 'proj_b' });

      expect(second).toBe(first);
      expect(otherProject).not.toBe(first);
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
      const list = () =>
        Effect.promise(() => client.tools.list({ limit: 1, toolkit_versions: 'latest' }));

      yield* list();
      yield* list();
      expect(yield* clientSingleton.getMetrics()).toEqual({ requests: 2, byteSize: 30 });

      yield* list();
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
