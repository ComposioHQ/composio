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
import { extendConfigProvider } from 'src/services/config';
import { CliUserConfig } from 'src/models/cli-user-config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { STAGING_BASE_URL, STAGING_WEB_URL } from 'src/constants';
import { makeKeyringService, KeyringService } from '@composio/cli-keyring/effect';
import {
  type CredentialStore,
  type EntryModifiers,
  KeyringError,
  CredentialPersistence,
} from '@composio/cli-keyring';
import path from 'node:path';

const makeInMemoryKeyringLayer = (initial: Record<string, string> = {}) => {
  const items = new Map<string, Uint8Array>(
    Object.entries(initial).map(([user, secret]) => [
      `com.composio.cli\0${user}`,
      new TextEncoder().encode(secret),
    ])
  );
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
};

const InMemoryKeyringLayer = makeInMemoryKeyringLayer();

const makeMockCliUserConfigLayer = (security: 'auto' | 'keychain-subprocess') =>
  Layer.succeed(
    ComposioCliUserConfig,
    ComposioCliUserConfig.of({
      data: {
        channel: 'beta',
        developerModeEnabled: true,
        developerDangerousCommandsEnabled: false,
        experimentalFeatures: {},
        artifactDirectory: undefined,
        experimentalSubagentTarget: 'auto',
        security,
      },
      raw: CliUserConfig.make({
        developer: { enabled: true, destructiveActions: false },
        experimentalFeatures: {},
        artifactDirectory: Option.none(),
        experimentalSubagent: Option.none(),
        security,
      }),
      channel: 'beta',
      isDevModeEnabled: () => true,
      areDeveloperDangerousCommandsEnabled: () => false,
      isExperimentalFeatureEnabled: () => true,
      update: () => Effect.void,
    })
  );

const MockCliUserConfigLayer = makeMockCliUserConfigLayer('auto');

const ComposioUserContextLive = Layer.provide(
  rawComposioUserContextLive,
  Layer.mergeAll(InMemoryKeyringLayer, MockCliUserConfigLayer)
);

const withEnvConfigProvider = (env: Record<string, string>) =>
  Layer.succeed(
    ConfigProvider.ConfigProvider,
    extendConfigProvider(ConfigProvider.fromEnv({ env }))
  );

// The layer reads `user_data.json` while it is built, so a test must write the
// file before providing the layer.
const makeUserContextLayer = (
  cwd: string,
  env: Record<string, string> = {},
  deps: Layer.Layer<KeyringService | ComposioCliUserConfig> = Layer.mergeAll(
    InMemoryKeyringLayer,
    MockCliUserConfigLayer
  )
) =>
  Layer.provideMerge(
    Layer.provide(rawComposioUserContextLive, deps),
    Layer.mergeAll(
      BunFileSystem.layer,
      BunPath.layer,
      Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd })),
      withEnvConfigProvider(env)
    )
  );

const writeUserDataFile = (cwd: string, contents: string, mode = 0o600) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const userDataPath = path.join(cwd, '.composio', 'user_data.json');
    yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
    yield* fs.writeFileString(userDataPath, contents);
    yield* fs.chmod(userDataPath, mode);
  }).pipe(Effect.provide(BunFileSystem.layer));

const readUserDataFile = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(path.join(cwd, '.composio', 'user_data.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  }).pipe(Effect.provide(BunFileSystem.layer));

const stagingLogin = {
  api_key: 'uak_staging',
  base_url: STAGING_BASE_URL,
  web_url: STAGING_WEB_URL,
  org_id: 'org_staging',
};

describe('ComposioUserContext', () => {
  const withMapConfigProvider = (map: Map<string, string>) =>
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      extendConfigProvider(ConfigProvider.fromEnv({ env: Object.fromEntries(map) }))
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
      it.effect('[Then] it reflects the config file', () => {
        const cwd = tempy.temporaryDirectory();
        const userDataPath = path.join(cwd, '.composio', 'user_data.json');
        const expectedUserData = UserData.make({
          apiKey: Option.some('api_key'),
          baseURL: Option.some('https://test.composio.localhost'),
          webURL: Option.some('https://dashboard.composio.dev/'),
          orgId: Option.none(),
          projectId: Option.none(),
          testUserId: Option.none(),
        });

        return Effect.gen(function* () {
          const userDataAsJson = yield* userDataToJSON(expectedUserData);
          yield* writeUserDataFile(cwd, userDataAsJson, 0o644);

          yield* Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const ctx = yield* ComposioUserContext;
            deepStrictEqual(ctx.data, {
              ...expectedUserData,
              baseURL: expectedUserData.baseURL.pipe(Option.getOrUndefined),
              webURL: expectedUserData.webURL.pipe(Option.getOrUndefined),
            });
            deepStrictEqual(ctx.isLoggedIn(), true);
            assertEquals(yield* fs.readFileString(userDataPath, 'utf8'), userDataAsJson);
            assertEquals((yield* fs.stat(userDataPath)).mode & 0o777, 0o600);
          }).pipe(Effect.provide(makeUserContextLayer(cwd)));
        });
      });
    });

    describe('[When] dynamic `APP_CONFIG` is set', () => {
      it.effect('[Then] the env key uses the ambient backend, not the stored one', () => {
        const cwd = tempy.temporaryDirectory();
        const storedUserData = UserData.make({
          apiKey: Option.some('stored_api_key'),
          baseURL: Option.some(STAGING_BASE_URL),
          webURL: Option.some(STAGING_WEB_URL),
          orgId: Option.none(),
          projectId: Option.none(),
          testUserId: Option.none(),
        });

        return Effect.gen(function* () {
          yield* writeUserDataFile(cwd, yield* userDataToJSON(storedUserData));

          yield* Effect.gen(function* () {
            const ctx = yield* ComposioUserContext;

            deepStrictEqual(ctx.data, {
              ...storedUserData,
              apiKey: Option.some('api_key'),
              baseURL: 'https://backend.composio.dev',
              webURL: 'https://dashboard.composio.dev/',
            });
            deepStrictEqual(ctx.backend.keySource, 'env');
            deepStrictEqual(ctx.backend.mismatch, false);
            deepStrictEqual(ctx.isLoggedIn(), true);
          }).pipe(Effect.provide(makeUserContextLayer(cwd, { COMPOSIO_USER_API_KEY: 'api_key' })));
        });
      });
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
  describe('[When] resolving the backend for the stored key', () => {
    const loadContext = (params: {
      readonly file: Record<string, unknown>;
      readonly env?: Record<string, string>;
    }) => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        yield* writeUserDataFile(cwd, JSON.stringify(params.file));
        return yield* ComposioUserContext.pipe(
          Effect.provide(makeUserContextLayer(cwd, params.env))
        );
      });
    };

    it.effect('[Given] a stored staging login and no env vars [Then] targets staging', () =>
      Effect.gen(function* () {
        const ctx = yield* loadContext({ file: stagingLogin });

        deepStrictEqual(ctx.data.baseURL, STAGING_BASE_URL);
        deepStrictEqual(ctx.data.webURL, STAGING_WEB_URL);
        deepStrictEqual(ctx.backend.keySource, 'stored');
        deepStrictEqual(ctx.backend.mismatch, false);
      })
    );

    it.effect('[Given] COMPOSIO_BASE_URL points at production [Then] reports a mismatch', () =>
      Effect.gen(function* () {
        const ctx = yield* loadContext({
          file: stagingLogin,
          env: { COMPOSIO_BASE_URL: 'https://backend.composio.dev' },
        });

        deepStrictEqual(ctx.data.baseURL, 'https://backend.composio.dev');
        deepStrictEqual(ctx.backend.mismatch, true);
        deepStrictEqual(ctx.backend.overrideVariable, 'COMPOSIO_BASE_URL');
        deepStrictEqual(ctx.backend.stored?.baseURL, STAGING_BASE_URL);
      })
    );

    it.effect('[Given] COMPOSIO_ENVIRONMENT=staging [Then] no mismatch', () =>
      Effect.gen(function* () {
        const ctx = yield* loadContext({
          file: stagingLogin,
          env: { COMPOSIO_ENVIRONMENT: 'staging' },
        });

        deepStrictEqual(ctx.data.baseURL, STAGING_BASE_URL);
        deepStrictEqual(ctx.backend.mismatch, false);
      })
    );

    it.effect('[Given] COMPOSIO_ENVIRONMENT=production [Then] reports a mismatch', () =>
      Effect.gen(function* () {
        const ctx = yield* loadContext({
          file: stagingLogin,
          env: { COMPOSIO_ENVIRONMENT: 'production' },
        });

        deepStrictEqual(ctx.data.baseURL, 'https://backend.composio.dev');
        deepStrictEqual(ctx.backend.mismatch, true);
        deepStrictEqual(ctx.backend.overrideVariable, 'COMPOSIO_ENVIRONMENT');
      })
    );

    it.effect('[Given] a blank COMPOSIO_BASE_URL [Then] it counts as unset', () =>
      Effect.gen(function* () {
        const ctx = yield* loadContext({ file: stagingLogin, env: { COMPOSIO_BASE_URL: '  ' } });

        deepStrictEqual(ctx.data.baseURL, STAGING_BASE_URL);
        deepStrictEqual(ctx.backend.overrideVariable, undefined);
      })
    );

    it.effect('[Given] the override differs only by a trailing slash [Then] no mismatch', () =>
      Effect.gen(function* () {
        const ctx = yield* loadContext({
          file: stagingLogin,
          env: { COMPOSIO_BASE_URL: `${STAGING_BASE_URL}/` },
        });

        deepStrictEqual(ctx.backend.mismatch, false);
      })
    );

    it.effect(
      '[Given] a file without base_url [Then] the stored key uses the ambient default',
      () =>
        Effect.gen(function* () {
          const ctx = yield* loadContext({ file: { api_key: 'uak_legacy', base_url: null } });

          deepStrictEqual(ctx.data.baseURL, 'https://backend.composio.dev');
          deepStrictEqual(ctx.backend.stored, undefined);
          deepStrictEqual(ctx.backend.keySource, 'stored');
        })
    );

    it.effect(
      '[Given] keychain security with the key in the keyring [Then] uses the stored backend',
      () => {
        const cwd = tempy.temporaryDirectory();
        const deps = Layer.mergeAll(
          makeInMemoryKeyringLayer({ default: 'uak_from_keyring' }),
          makeMockCliUserConfigLayer('keychain-subprocess')
        );
        const { api_key: _omitted, ...fileWithoutKey } = stagingLogin;

        return Effect.gen(function* () {
          yield* writeUserDataFile(cwd, JSON.stringify(fileWithoutKey));
          const ctx = yield* ComposioUserContext.pipe(
            Effect.provide(makeUserContextLayer(cwd, {}, deps))
          );

          deepStrictEqual(Option.getOrUndefined(ctx.data.apiKey), 'uak_from_keyring');
          deepStrictEqual(ctx.data.baseURL, STAGING_BASE_URL);
          deepStrictEqual(ctx.backend.keySource, 'stored');
        });
      }
    );

    it.effect(
      '[Given] an override during a keyring migration [Then] the rewrite keeps the stored base_url',
      () => {
        const cwd = tempy.temporaryDirectory();
        const deps = Layer.mergeAll(
          makeInMemoryKeyringLayer(),
          makeMockCliUserConfigLayer('keychain-subprocess')
        );

        return Effect.gen(function* () {
          yield* writeUserDataFile(cwd, JSON.stringify(stagingLogin));
          yield* ComposioUserContext.pipe(
            Effect.provide(
              makeUserContextLayer(cwd, { COMPOSIO_BASE_URL: 'https://backend.composio.dev' }, deps)
            )
          );

          const onDisk = yield* readUserDataFile(cwd);
          deepStrictEqual(onDisk.api_key, undefined);
          deepStrictEqual(onDisk.base_url, STAGING_BASE_URL);
          deepStrictEqual(onDisk.web_url, STAGING_WEB_URL);
        });
      }
    );
  });
});
