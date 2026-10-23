import { describe, it } from '@effect/vitest';
import { assertEquals, deepStrictEqual } from '@effect/vitest/utils';
import * as FileSystem from 'effect/FileSystem';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import * as tempy from 'tempy';
import { ComposioUserContext, rawComposioUserContextLive } from 'src/services/user-context';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { UserData, UserDataWithDefaults, userDataToJSON } from 'src/models/user-data';
import { CliUserConfig } from 'src/models/cli-user-config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { makeKeyringService, KeyringService } from '@composio/cli-keyring/effect';
import {
  type CredentialStore,
  type EntryModifiers,
  KeyringError,
  CredentialPersistence,
} from '@composio/cli-keyring';
import fs from 'node:fs';
import path from 'node:path';

const InMemoryKeyringLayer = (() => {
  const items = new Map<string, Uint8Array>();
  const key = (s: string, u: string) => `${s}\0${u}`;
  const store: CredentialStore = {
    id: 'memory',
    vendor: 'test',
    persistence: () => CredentialPersistence.ProcessOnly,
    async setSecret(s: string, u: string, secret: Uint8Array, _m: EntryModifiers) {
      items.set(key(s, u), new Uint8Array(secret));
    },
    async getSecret(s: string, u: string, _m: EntryModifiers) {
      const v = items.get(key(s, u));
      if (!v) throw new KeyringError({ kind: 'NoEntry' });
      return v;
    },
    async deleteCredential(s: string, u: string, _m: EntryModifiers) {
      if (!items.delete(key(s, u))) throw new KeyringError({ kind: 'NoEntry' });
    },
  };
  return Layer.succeed(KeyringService, makeKeyringService(store));
})();

const MockCliUserConfigLayer = Layer.succeed(
  ComposioCliUserConfig,
  ComposioCliUserConfig.of({
    data: {
      channel: 'beta',
      developerModeEnabled: true,
      developerDangerousCommandsEnabled: false,
      experimentalFeatures: {},
      artifactDirectory: undefined,
      security: 'auto',
    },
    raw: CliUserConfig.make({
      developer: { enabled: true, destructiveActions: false },
      experimentalFeatures: {},
      artifactDirectory: Option.none(),
      security: 'auto',
    }),
    channel: 'beta',
    isDevModeEnabled: () => true,
    areDeveloperDangerousCommandsEnabled: () => false,
    isExperimentalFeatureEnabled: () => true,
    update: () => Effect.void,
  })
);

const ComposioUserContextLive = Layer.provide(
  rawComposioUserContextLive,
  Layer.mergeAll(InMemoryKeyringLayer, MockCliUserConfigLayer)
);

describe('ComposioUserContext', () => {
  const withMapConfigProvider = (map: Map<string, string>) =>
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env: Object.fromEntries(map) })
    );

  describe('[When] no `~/.composio/user_data.json` config file exists', () => {
    describe('[When] no dynamic `Config` is set', () => {
      it.effect('[Then] it contains default user data', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.none(),
            baseURL: 'https://backend.composio.dev',
            webURL: 'https://dashboard.composio.dev/',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          deepStrictEqual(ctx.data, expectedUserData);
          deepStrictEqual(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] dynamic `APP_CONFIG` is set', () => {
      it.effect('[Then] is logged in', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([
          ['COMPOSIO_USER_API_KEY', 'api_key'],
          ['COMPOSIO_BASE_URL', 'https://test.composio.localhost'],
        ]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.some('api_key'),
            baseURL: 'https://test.composio.localhost',
            webURL: 'https://dashboard.composio.dev/',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          deepStrictEqual(ctx.data, expectedUserData);
          deepStrictEqual(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });

      it.effect('[Then] COMPOSIO_API_KEY alone does not authenticate user context', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([['COMPOSIO_API_KEY', 'legacy_api_key']]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          deepStrictEqual(ctx.isLoggedIn(), false);
          deepStrictEqual(Option.getOrUndefined(ctx.data.apiKey), undefined);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });
  });

  describe('[When] `~/.composio/user_data.json` config file exists', () => {
    describe('[When] no dynamic `Config` is set', () => {
      // Note: this test only passes when using `it`, not `it.scoped`
      it('[Then] it reflects the config file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const expectedUserData = UserData.make({
            apiKey: Option.some('api_key'),
            baseURL: Option.some('https://test.composio.localhost'),
            webURL: Option.some('https://dashboard.composio.dev/'),
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          const userDataAsJson = yield* userDataToJSON(expectedUserData);

          const fs = yield* FileSystem.FileSystem;
          const userDataPath = path.join(cwd, '.composio', 'user_data.json');
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(userDataPath, userDataAsJson);
          yield* fs.chmod(userDataPath, 0o644);
          assertEquals((yield* fs.stat(userDataPath)).mode & 0o777, 0o644);

          const ctx = yield* ComposioUserContext;
          deepStrictEqual(ctx.data, {
            ...expectedUserData,
            baseURL: expectedUserData.baseURL.pipe(Option.getOrUndefined),
            webURL: expectedUserData.webURL.pipe(Option.getOrUndefined),
          });
          deepStrictEqual(ctx.isLoggedIn(), true);
          assertEquals(yield* fs.readFileString(userDataPath, 'utf8'), userDataAsJson);
          assertEquals((yield* fs.stat(userDataPath)).mode & 0o777, 0o600);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] dynamic `APP_CONFIG` is set', () => {
      it.effect('[Then] it overrides the config file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([['COMPOSIO_USER_API_KEY', 'api_key']]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const expectedUserData = UserData.make({
            apiKey: Option.some('api_key'),
            baseURL: Option.none(),
            webURL: Option.some('https://dashboard.composio.dev/'),
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          const userDataAsJson = yield* userDataToJSON(expectedUserData);

          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), userDataAsJson);

          const ctx = yield* ComposioUserContext;

          deepStrictEqual(ctx.data, {
            ...expectedUserData,
            baseURL: 'https://backend.composio.dev',
            webURL: expectedUserData.webURL.pipe(Option.getOrUndefined),
          });
          deepStrictEqual(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    it.effect('[Then] preserves unknown fields across read-modify-write updates', () => {
      const cwd = tempy.temporaryDirectory();
      const map = new Map([]) satisfies Map<string, string>;
      const userDataPath = path.join(cwd, '.composio', 'user_data.json');
      fs.mkdirSync(path.dirname(userDataPath), { recursive: true });
      fs.writeFileSync(
        userDataPath,
        JSON.stringify({
          api_key: 'old-api-key',
          future_auth: {
            provider: 'custom',
            scopes: ['read', 'write'],
          },
        })
      );

      const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
      const ComposioUserContextTest = Layer.provideMerge(
        ComposioUserContextLive,
        Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
      );

      return Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const ctx = yield* ComposioUserContext;
        yield* ctx.login('new-api-key');

        const parsed = JSON.parse(yield* fileSystem.readFileString(userDataPath, 'utf8')) as {
          api_key: string;
          future_auth: { provider: string; scopes: Array<string> };
        };
        assertEquals(parsed.api_key, 'new-api-key');
        assertEquals(parsed.future_auth, {
          provider: 'custom',
          scopes: ['read', 'write'],
        });
      }).pipe(Effect.provide(ComposioUserContextTest));
    });

    describe('[When] the file is empty', () => {
      it('[Then] it falls back to defaults and overwrites the file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          // Write an empty file
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), '');

          // Should NOT throw — should fall back to defaults
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.none(),
            baseURL: 'https://backend.composio.dev',
            webURL: 'https://dashboard.composio.dev/',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          deepStrictEqual(ctx.data, expectedUserData);
          deepStrictEqual(ctx.isLoggedIn(), false);

          // The corrupted file should have been overwritten with valid defaults
          const contents = yield* fs.readFileString(
            path.join(cwd, '.composio', 'user_data.json'),
            'utf8'
          );
          const parsed = JSON.parse(contents);
          deepStrictEqual(parsed.api_key, null);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file contains invalid JSON', () => {
      it('[Then] it falls back to defaults and overwrites the file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          // Write corrupted JSON
          yield* fs.writeFileString(
            path.join(cwd, '.composio', 'user_data.json'),
            '{not valid json!!!'
          );

          // Should NOT throw — should fall back to defaults
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.none(),
            baseURL: 'https://backend.composio.dev',
            webURL: 'https://dashboard.composio.dev/',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          deepStrictEqual(ctx.data, expectedUserData);
          deepStrictEqual(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file contains valid JSON but wrong schema', () => {
      it('[Then] it falls back to defaults and overwrites the file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          // Write valid JSON but with wrong schema (api_key should be string|null, not number)
          yield* fs.writeFileString(
            path.join(cwd, '.composio', 'user_data.json'),
            JSON.stringify({ api_key: 12345, unknown_field: true })
          );

          // Should NOT throw — should fall back to defaults
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.none(),
            baseURL: 'https://backend.composio.dev',
            webURL: 'https://dashboard.composio.dev/',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          deepStrictEqual(ctx.data, expectedUserData);
          deepStrictEqual(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file is corrupted but env USER_API_KEY is set', () => {
      it('[Then] it falls back to defaults but preserves env USER_API_KEY', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([
          ['COMPOSIO_USER_API_KEY', 'env_api_key'],
          ['COMPOSIO_API_KEY', 'legacy_api_key_should_be_ignored'],
        ]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), '');

          const ctx = yield* ComposioUserContext;

          // Despite corrupted file, env USER_API_KEY should still work
          deepStrictEqual(ctx.isLoggedIn(), true);
          deepStrictEqual(Option.getOrUndefined(ctx.data.apiKey), 'env_api_key');
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });
  });

  describe('[When] resolving the backend of a stored login', () => {
    const STAGING = {
      base_url: 'https://staging-backend.composio.dev',
      web_url: 'https://staging-dashboard.composio.dev/',
    };
    const PRODUCTION = {
      base_url: 'https://backend.composio.dev',
      web_url: 'https://dashboard.composio.dev/',
    };

    /** Builds the context over a home whose user_data.json is `stored` (none when undefined). */
    const withContext = <A, E>(
      env: Record<string, string>,
      stored: Record<string, unknown> | undefined,
      use: (ctx: ComposioUserContext['Service'], userDataPath: string) => Effect.Effect<A, E>
    ) => {
      const home = tempy.temporaryDirectory();
      const userDataPath = path.join(home, '.composio', 'user_data.json');
      if (stored !== undefined) {
        fs.mkdirSync(path.dirname(userDataPath), { recursive: true });
        fs.writeFileSync(userDataPath, JSON.stringify(stored));
      }
      const layer = Layer.provideMerge(
        ComposioUserContextLive,
        Layer.mergeAll(
          BunFileSystem.layer,
          BunPath.layer,
          Layer.succeed(NodeOs, defaultNodeOs({ homedir: home })),
          withMapConfigProvider(new Map(Object.entries(env)))
        )
      );
      return Effect.flatMap(ComposioUserContext, ctx => use(ctx, userDataPath)).pipe(
        Effect.provide(layer)
      );
    };
    const readStored = (userDataPath: string) =>
      JSON.parse(fs.readFileSync(userDataPath, 'utf8')) as Record<string, unknown>;
    const stagingLogin = { api_key: 'uak_staging', org_id: 'org_1', ...STAGING };

    it.effect('[Given] a staging login and no env var [Then] it uses staging', () =>
      withContext({}, stagingLogin, ctx =>
        Effect.sync(() => {
          assertEquals(ctx.data.baseURL, STAGING.base_url);
          assertEquals(ctx.data.webURL, STAGING.web_url);
          assertEquals(Option.isNone(ctx.backendMismatch), true);
        })
      )
    );

    it.effect(
      '[Given] a staging login and COMPOSIO_BASE_URL [Then] the env var wins and the mismatch is reported',
      () =>
        withContext({ COMPOSIO_BASE_URL: PRODUCTION.base_url }, stagingLogin, ctx =>
          Effect.sync(() => {
            assertEquals(ctx.data.baseURL, PRODUCTION.base_url);
            assertEquals(ctx.data.webURL, PRODUCTION.web_url);
            deepStrictEqual(
              ctx.backendMismatch,
              Option.some({
                variable: 'COMPOSIO_BASE_URL' as const,
                issuedBy: STAGING.base_url,
                selected: PRODUCTION.base_url,
              })
            );
          })
        )
    );

    it.effect(
      '[Given] a staging login and COMPOSIO_ENVIRONMENT=staging [Then] nothing is reported',
      () =>
        withContext({ COMPOSIO_ENVIRONMENT: 'staging' }, stagingLogin, ctx =>
          Effect.sync(() => {
            assertEquals(ctx.data.baseURL, STAGING.base_url);
            assertEquals(Option.isNone(ctx.backendMismatch), true);
          })
        )
    );

    it.effect(
      '[Given] COMPOSIO_USER_API_KEY and no env var [Then] it uses the default backend',
      () =>
        withContext({ COMPOSIO_USER_API_KEY: 'uak_env' }, stagingLogin, ctx =>
          Effect.sync(() => {
            assertEquals(ctx.data.baseURL, PRODUCTION.base_url);
            assertEquals(ctx.data.webURL, PRODUCTION.web_url);
            assertEquals(Option.isNone(ctx.backendMismatch), true);
          })
        )
    );

    it.effect(
      '[Given] a recorded backend but no stored key [Then] it uses the default backend',
      () =>
        withContext({}, { api_key: null, ...STAGING }, ctx =>
          Effect.sync(() => {
            assertEquals(ctx.data.baseURL, PRODUCTION.base_url);
            assertEquals(ctx.data.webURL, PRODUCTION.web_url);
          })
        )
    );

    it.effect(
      '[Given] an env override [When] the user data is updated [Then] the stored backend is kept',
      () =>
        withContext(
          { COMPOSIO_BASE_URL: 'http://127.0.0.1:9' },
          stagingLogin,
          (ctx, userDataPath) =>
            Effect.gen(function* () {
              yield* ctx.update({ orgId: Option.some('org_2') });
              const stored = readStored(userDataPath);
              assertEquals(stored.org_id, 'org_2');
              assertEquals(stored.base_url, STAGING.base_url);
              assertEquals(stored.web_url, STAGING.web_url);
            })
        )
    );

    it.effect(
      '[Given] COMPOSIO_ENVIRONMENT=staging [When] logging in [Then] the staging backend is recorded',
      () =>
        withContext({ COMPOSIO_ENVIRONMENT: 'staging' }, undefined, (ctx, userDataPath) =>
          Effect.gen(function* () {
            yield* ctx.login('uak_new', 'org_1');
            const stored = readStored(userDataPath);
            assertEquals(stored.base_url, STAGING.base_url);
            assertEquals(stored.web_url, STAGING.web_url);
          })
        )
    );

    it.effect(
      '[Given] a staging login and no env var [When] logging in again [Then] staging stays recorded',
      () =>
        withContext({}, stagingLogin, (ctx, userDataPath) =>
          Effect.gen(function* () {
            yield* ctx.login('uak_again', 'org_1');
            assertEquals(readStored(userDataPath).base_url, STAGING.base_url);
            assertEquals(ctx.data.baseURL, STAGING.base_url);
          })
        )
    );

    it.effect(
      '[Given] a staging login and COMPOSIO_USER_API_KEY [When] the user data is updated [Then] the stored key stays paired with its backend',
      () =>
        withContext(
          { COMPOSIO_USER_API_KEY: 'uak_env_production' },
          stagingLogin,
          (ctx, userDataPath) =>
            Effect.gen(function* () {
              yield* ctx.update({ orgId: Option.some('org_2') });
              const stored = readStored(userDataPath);
              assertEquals(stored.org_id, 'org_2');
              assertEquals(stored.api_key, 'uak_staging');
              assertEquals(stored.base_url, STAGING.base_url);
              // The env key still serves this run's requests.
              assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'uak_env_production');
            })
        )
    );

    it.effect(
      '[Given] COMPOSIO_USER_API_KEY and no stored login [When] the user data is updated [Then] the env key is not written',
      () =>
        withContext({ COMPOSIO_USER_API_KEY: 'uak_env_only' }, undefined, (ctx, userDataPath) =>
          Effect.gen(function* () {
            yield* ctx.update({ orgId: Option.some('org_2') });
            const stored = readStored(userDataPath);
            assertEquals(stored.org_id, 'org_2');
            assertEquals(stored.api_key ?? null, null);
          })
        )
    );

    it.effect(
      '[Given] a login recorded against another backend [When] an agent identity logs in [Then] the env-selected backend is recorded',
      () =>
        withContext(
          {},
          { api_key: 'uak_old', base_url: 'https://proxy.example.test', web_url: null },
          (ctx, userDataPath) =>
            Effect.gen(function* () {
              yield* ctx.login('uak_agent', 'org_agent', undefined, { issuer: 'environment' });
              const stored = readStored(userDataPath);
              assertEquals(stored.api_key, 'uak_agent');
              assertEquals(stored.base_url, PRODUCTION.base_url);
              assertEquals(stored.web_url, PRODUCTION.web_url);
              assertEquals(ctx.data.baseURL, PRODUCTION.base_url);
            })
        )
    );

    it.effect(
      '[Given] COMPOSIO_ENVIRONMENT=staging and an older production login [When] an agent identity logs in [Then] staging is recorded',
      () =>
        withContext(
          { COMPOSIO_ENVIRONMENT: 'staging' },
          { api_key: 'uak_old', ...PRODUCTION },
          (ctx, userDataPath) =>
            Effect.gen(function* () {
              yield* ctx.login('uak_agent', 'org_agent', undefined, { issuer: 'environment' });
              assertEquals(readStored(userDataPath).base_url, STAGING.base_url);
            })
        )
    );

    it.effect('[When] logging out [Then] the recorded backend is forgotten', () =>
      withContext({}, stagingLogin, (ctx, userDataPath) =>
        Effect.gen(function* () {
          yield* ctx.logout;
          const stored = readStored(userDataPath);
          assertEquals(stored.base_url, null);
          assertEquals(stored.web_url, null);
          assertEquals(ctx.data.baseURL, PRODUCTION.base_url);
        })
      )
    );
  });
});
