import { describe, it } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';
import { FileSystem } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer, Option, Data } from 'effect';
import * as tempy from 'tempy';
import {
  ComposioUserContext,
  KEYRING_SERVICE,
  KEYRING_USER,
  resolveMacOSBackend,
  CredentialPersistenceError,
} from 'src/services/user-context';
import type { SecurityBackend } from 'src/models/cli-user-config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { UserData, UserDataWithDefaults, userDataToJSON } from 'src/models/user-data';
import { extendConfigProvider } from 'src/services/config';
import {
  makeFakeKeyring,
  makeUnavailableKeyring,
  type FakeKeyring,
} from 'test/__utils__/services/keyring';
import { makeUserContextLayer as makeUserContextLive } from 'test/__utils__/services/user-context';
import path from 'node:path';

describe('ComposioUserContext', () => {
  const withMapConfigProvider = (map: Map<string, string>) =>
    Layer.setConfigProvider(extendConfigProvider(ConfigProvider.fromMap(map)));

  describe('[When] no `~/.composio/user_data.json` config file exists', () => {
    describe('[When] no dynamic `Config` is set', () => {
      it.scoped('[Then] it contains default user data', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
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
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] dynamic `APP_CONFIG` is set', () => {
      it.scoped('[Then] is logged in', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([
          ['COMPOSIO_USER_API_KEY', 'api_key'],
          ['COMPOSIO_BASE_URL', 'https://test.composio.localhost'],
        ]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
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
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });

      it.scoped('[Then] COMPOSIO_API_KEY alone does not authenticate user context', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([['COMPOSIO_API_KEY', 'legacy_api_key']]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          assertEquals(ctx.isLoggedIn(), false);
          assertEquals(Option.getOrUndefined(ctx.data.apiKey), undefined);
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
          makeUserContextLive(),
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
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), userDataAsJson);

          const ctx = yield* ComposioUserContext;
          assertEquals(
            Data.struct(ctx.data),
            Data.struct({
              ...expectedUserData,
              baseURL: expectedUserData.baseURL.pipe(Option.getOrUndefined),
              webURL: expectedUserData.webURL.pipe(Option.getOrUndefined),
            })
          );
          assertEquals(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] dynamic `APP_CONFIG` is set', () => {
      it.scoped('[Then] it overrides the config file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([['COMPOSIO_USER_API_KEY', 'api_key']]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
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

          assertEquals(
            Data.struct(ctx.data),
            Data.struct({
              ...expectedUserData,
              baseURL: 'https://backend.composio.dev',
              webURL: expectedUserData.webURL.pipe(Option.getOrUndefined),
            })
          );
          assertEquals(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file is empty', () => {
      it('[Then] it falls back to defaults and overwrites the file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
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
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), false);

          // The corrupted file should have been overwritten with valid defaults
          const contents = yield* fs.readFileString(
            path.join(cwd, '.composio', 'user_data.json'),
            'utf8'
          );
          const parsed = JSON.parse(contents);
          assertEquals(parsed.api_key, null);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file contains invalid JSON', () => {
      it('[Then] it falls back to defaults and overwrites the file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
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
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file contains valid JSON but wrong schema', () => {
      it('[Then] it falls back to defaults and overwrites the file', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          makeUserContextLive(),
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
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), false);
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
          makeUserContextLive(),
          Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), '');

          const ctx = yield* ComposioUserContext;

          // Despite corrupted file, env USER_API_KEY should still work
          assertEquals(ctx.isLoggedIn(), true);
          assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'env_api_key');
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });
  });

  describe('[When] tests inject a fake credential store', () => {
    const withKeyring = (keyring: ReturnType<typeof makeFakeKeyring>, homedir: string) =>
      Layer.provideMerge(
        makeUserContextLive({ keyring, security: 'keychain-subprocess' }),
        Layer.mergeAll(
          BunFileSystem.layer,
          BunPath.layer,
          Layer.succeed(NodeOs, defaultNodeOs({ homedir })),
          Layer.setConfigProvider(extendConfigProvider(ConfigProvider.fromMap(new Map([]))))
        )
      );

    it('[Then] every keyring operation reaches the fake, in order', () => {
      const keyring = makeFakeKeyring();

      return Effect.gen(function* () {
        const ctx = yield* ComposioUserContext;
        yield* ctx.login('kr_api_key');
        yield* ctx.logout;

        assertEquals(keyring.operations(), ['get', 'set', 'delete']);
        assertEquals(
          keyring.calls.every(
            call => call.service === KEYRING_SERVICE && call.user === KEYRING_USER
          ),
          true
        );
        assertEquals(keyring.peek(KEYRING_SERVICE, KEYRING_USER), undefined);
      }).pipe(Effect.provide(withKeyring(keyring, tempy.temporaryDirectory())));
    });

    it('[Then] a seeded credential is read back through the fake', () => {
      const keyring = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'seeded_api_key']],
      });

      return Effect.gen(function* () {
        const ctx = yield* ComposioUserContext;

        assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'seeded_api_key');
        assertEquals(keyring.operations(), ['get']);
      }).pipe(Effect.provide(withKeyring(keyring, tempy.temporaryDirectory())));
    });

    it('[Then] each fake owns an independent credential map and call log', () => {
      const first = makeFakeKeyring({ seed: [[KEYRING_SERVICE, KEYRING_USER, 'first_key']] });
      const second = makeFakeKeyring();

      assertEquals(first.peek(KEYRING_SERVICE, KEYRING_USER), 'first_key');
      assertEquals(second.peek(KEYRING_SERVICE, KEYRING_USER), undefined);

      return Effect.gen(function* () {
        const ctx = yield* ComposioUserContext;
        yield* ctx.login('second_key');

        assertEquals(second.peek(KEYRING_SERVICE, KEYRING_USER), 'second_key');
        // The first fake never saw a call and keeps its own value.
        assertEquals(first.peek(KEYRING_SERVICE, KEYRING_USER), 'first_key');
        assertEquals(first.calls.length, 0);
      }).pipe(Effect.provide(withKeyring(second, tempy.temporaryDirectory())));
    });

    it('[Then] scripted failures surface as typed KeyringError values', () => {
      const keyring = makeFakeKeyring({
        alwaysFail: { set: { kind: 'NoStorageAccess', cause: new Error('locked') } },
      });

      return Effect.gen(function* () {
        const failure = yield* keyring.service
          .setPassword(KEYRING_SERVICE, KEYRING_USER, 'never_stored')
          .pipe(Effect.flip);

        assertEquals(failure.kind, 'NoStorageAccess');
        assertEquals(failure.is('NoStorageAccess'), true);
        assertEquals(keyring.operations(), ['set']);

        const missing = yield* keyring.service
          .getPassword(KEYRING_SERVICE, KEYRING_USER)
          .pipe(Effect.flip);
        assertEquals(missing.kind, 'NoEntry');
      });
    });
  });

  // ---------------------------------------------------------------------
  // Keyring-backed storage: default persistence, fallback, migration,
  // logout tombstones, and atomic user-data replacement.
  // ---------------------------------------------------------------------
  describe('[When] the API key is stored through the OS credential store', () => {
    const userDataPath = (homedir: string) => path.join(homedir, '.composio', 'user_data.json');

    const contextLayer = (options: {
      readonly homedir: string;
      readonly keyring?: FakeKeyring;
      readonly security?: SecurityBackend;
      readonly env?: Map<string, string>;
    }) =>
      Layer.provideMerge(
        makeUserContextLive({ keyring: options.keyring, security: options.security }),
        Layer.mergeAll(
          BunFileSystem.layer,
          BunPath.layer,
          Layer.succeed(NodeOs, defaultNodeOs({ homedir: options.homedir })),
          withMapConfigProvider(options.env ?? new Map())
        )
      );

    /**
     * Run an effect expected to fail with `CredentialPersistenceError`
     * and hand back the narrowed error.
     */
    const expectPersistenceError = <A, E>(effect: Effect.Effect<A, E, never>) =>
      effect.pipe(
        Effect.flip,
        Effect.filterOrDieMessage(
          (error): error is E & CredentialPersistenceError =>
            error instanceof CredentialPersistenceError,
          'expected the login to fail with a CredentialPersistenceError'
        )
      );

    /** Filesystem-only layer, for arranging and inspecting `user_data.json`. */
    const fsLayer = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

    const seedUserDataFile = (homedir: string, contents: Record<string, unknown>) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(path.join(homedir, '.composio'), { recursive: true });
        yield* fs.writeFileString(userDataPath(homedir), JSON.stringify(contents));
      });

    const readUserDataFile = (homedir: string) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const raw = yield* fs.readFileString(userDataPath(homedir), 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
      });

    it('[AE1] [Then] an environment key wins and no keyring call is made', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'keyring_key']],
      });
      const env = new Map([['COMPOSIO_USER_API_KEY', 'env_key']]);

      return Effect.gen(function* () {
        yield* seedUserDataFile(homedir, { api_key: 'plaintext_key' });

        const ctx = yield* ComposioUserContext;
        assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'env_key');
        assertEquals(ctx.credentialSource(), 'environment');
        assertEquals(keyring.calls.length, 0);

        // The plaintext key on disk is left exactly as it was found:
        // an environment override must not migrate or scrub it.
        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], 'plaintext_key');
      }).pipe(Effect.provide(contextLayer({ homedir, keyring, env })), Effect.provide(fsLayer));
    });

    it('[AE2] [Then] `security: "json"` performs no keyring operation on load, login, or update', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'keyring_key']],
      });

      return Effect.gen(function* () {
        yield* seedUserDataFile(homedir, { api_key: 'plaintext_key' });

        const ctx = yield* ComposioUserContext;
        assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'plaintext_key');
        assertEquals(ctx.credentialSource(), 'plaintext');

        yield* ctx.login('new_plaintext_key');
        yield* ctx.update({ orgId: Option.some('org_1') });

        assertEquals(keyring.calls.length, 0);

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], 'new_plaintext_key');
        assertEquals(onDisk['org_id'], 'org_1');
      }).pipe(
        Effect.provide(contextLayer({ homedir, keyring, security: 'json' })),
        Effect.provide(fsLayer)
      );
    });

    it('[AE3] [Then] a default login stores the key in the keyring and not in user_data.json', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring();

      return Effect.gen(function* () {
        const ctx = yield* ComposioUserContext;
        yield* ctx.login('fresh_key', 'org_1');

        assertEquals(keyring.peek(KEYRING_SERVICE, KEYRING_USER), 'fresh_key');
        assertEquals(ctx.credentialSource(), 'keyring');

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], null);
        assertEquals(onDisk['org_id'], 'org_1');
        assertEquals(onDisk['api_key_fallback'], undefined);
      }).pipe(Effect.provide(contextLayer({ homedir, keyring })), Effect.provide(fsLayer));
    });

    it('[AE4] [Then] a rejected keyring write falls back to plaintext and survives a second process', () => {
      const homedir = tempy.temporaryDirectory();
      const first = makeUnavailableKeyring();
      const second = makeUnavailableKeyring();

      return Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          yield* ctx.login('fallback_key');
          assertEquals(ctx.credentialSource(), 'plaintext');
          assertEquals(ctx.data.apiKeyFallback, true);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring: first })));

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], 'fallback_key');
        assertEquals(onDisk['api_key_fallback'], true);

        // R13: a file holding a plaintext credential is owner-only.
        const fs = yield* FileSystem.FileSystem;
        const info = yield* fs.stat(userDataPath(homedir));
        assertEquals(info.mode & 0o777, 0o600);

        // A separate process reads the fallback and stays authenticated.
        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          assertEquals(ctx.isLoggedIn(), true);
          assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'fallback_key');
          assertEquals(ctx.credentialSource(), 'plaintext');
        }).pipe(Effect.provide(contextLayer({ homedir, keyring: second })));
      }).pipe(Effect.provide(fsLayer));
    });

    it('[AE5] [Then] a newer plaintext key overwrites a stale keyring value before being scrubbed', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'stale_keyring_key']],
      });

      return Effect.gen(function* () {
        yield* seedUserDataFile(homedir, {
          api_key: 'newer_plaintext_key',
          api_key_fallback: true,
        });

        const ctx = yield* ComposioUserContext;

        assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'newer_plaintext_key');
        assertEquals(ctx.credentialSource(), 'keyring');
        assertEquals(keyring.peek(KEYRING_SERVICE, KEYRING_USER), 'newer_plaintext_key');

        // The stale value is never read: plaintext is authoritative, so
        // the only keyring operation is the overwriting write.
        assertEquals(keyring.operations(), ['set']);

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], null);
        assertEquals(onDisk['api_key_fallback'], undefined);
      }).pipe(Effect.provide(contextLayer({ homedir, keyring })), Effect.provide(fsLayer));
    });

    it('[AE6] [Then] plaintext stays authoritative when the keyring write succeeds but the scrub fails', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring();

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* seedUserDataFile(homedir, { api_key: 'plaintext_key' });
        // Read-only directory: the temp file backing the atomic
        // replacement cannot be created, so the scrub fails.
        yield* fs.chmod(path.join(homedir, '.composio'), 0o500);

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'plaintext_key');
          assertEquals(ctx.credentialSource(), 'plaintext');
        }).pipe(Effect.provide(contextLayer({ homedir, keyring })));

        // The key reached the keyring, but the plaintext copy is intact.
        assertEquals(keyring.peek(KEYRING_SERVICE, KEYRING_USER), 'plaintext_key');
        yield* fs.chmod(path.join(homedir, '.composio'), 0o700);
        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], 'plaintext_key');
      }).pipe(Effect.provide(fsLayer));
    });

    it('[AE7] [Then] `auto` reads a credential written in `keychain-subprocess` mode without rewriting it', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'existing_opt_in_key']],
      });

      return Effect.gen(function* () {
        const ctx = yield* ComposioUserContext;

        assertEquals(ctx.isLoggedIn(), true);
        assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'existing_opt_in_key');
        assertEquals(ctx.credentialSource(), 'keyring');
        assertEquals(keyring.operations(), ['get']);
      }).pipe(Effect.provide(contextLayer({ homedir, keyring })));
    });

    it('[AE8] [Then] only `keychain` selects the macOS FFI backend', () => {
      assertEquals(resolveMacOSBackend('keychain'), 'ffi');
      assertEquals(resolveMacOSBackend('auto'), 'auto');
      assertEquals(resolveMacOSBackend('keychain-subprocess'), 'auto');
      assertEquals(resolveMacOSBackend('json'), 'auto');
    });

    it('[AE9] [Then] a failed logout delete leaves a tombstone that outranks the stored credential', () => {
      const homedir = tempy.temporaryDirectory();
      const rejecting = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'stored_key']],
        alwaysFail: { delete: { kind: 'NoStorageAccess', cause: new Error('locked') } },
      });
      // The credential is still in the store when the next process starts.
      const recovered = makeFakeKeyring({
        seed: [[KEYRING_SERVICE, KEYRING_USER, 'stored_key']],
      });

      return Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          assertEquals(ctx.isLoggedIn(), true);
          yield* ctx.logout;
          assertEquals(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring: rejecting })));

        const afterLogout = yield* readUserDataFile(homedir);
        assertEquals(afterLogout['api_key'], null);
        assertEquals(afterLogout['pending_keyring_logout'], true);

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          // The tombstone wins over the credential still in the store.
          assertEquals(ctx.isLoggedIn(), false);
          assertEquals(ctx.credentialSource(), 'none');
          // Cleanup is retried, and this time it succeeds.
          assertEquals(recovered.operations(), ['delete']);
          assertEquals(recovered.peek(KEYRING_SERVICE, KEYRING_USER), undefined);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring: recovered })));

        const afterCleanup = yield* readUserDataFile(homedir);
        assertEquals(afterCleanup['pending_keyring_logout'], undefined);
      }).pipe(Effect.provide(fsLayer));
    });

    it('[AE10] [Then] login after a tombstone succeeds only when both writes are durable', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring();

      return Effect.gen(function* () {
        yield* seedUserDataFile(homedir, { api_key: null, pending_keyring_logout: true });

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          yield* ctx.login('key_after_tombstone');
          assertEquals(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring })));

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['pending_keyring_logout'], undefined);
        assertEquals(keyring.peek(KEYRING_SERVICE, KEYRING_USER), 'key_after_tombstone');
      }).pipe(Effect.provide(fsLayer));
    });

    it('[AE10] [Then] login fails and keeps the tombstone when user_data.json cannot be written', () => {
      const homedir = tempy.temporaryDirectory();
      // The delete keeps failing, so the tombstone survives the load.
      const keyring = makeFakeKeyring({
        alwaysFail: { delete: { kind: 'NoStorageAccess', cause: new Error('locked') } },
      });

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* seedUserDataFile(homedir, { api_key: null, pending_keyring_logout: true });
        yield* fs.chmod(path.join(homedir, '.composio'), 0o500);

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          const error = yield* expectPersistenceError(ctx.login('doomed_key'));
          assertEquals(error.keyringStored, true);
          assertEquals(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring })));

        yield* fs.chmod(path.join(homedir, '.composio'), 0o700);
        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['pending_keyring_logout'], true);
      }).pipe(Effect.provide(fsLayer));
    });

    it('[Then] login fails only when neither the keyring nor user_data.json can store the key', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeUnavailableKeyring();

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(path.join(homedir, '.composio'), { recursive: true });
        yield* fs.writeFileString(userDataPath(homedir), JSON.stringify({ api_key: null }));
        yield* fs.chmod(path.join(homedir, '.composio'), 0o500);

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          const error = yield* expectPersistenceError(ctx.login('nowhere_to_go'));
          assertEquals(error.keyringStored, false);
          assertEquals(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring })));

        yield* fs.chmod(path.join(homedir, '.composio'), 0o700);
      }).pipe(Effect.provide(fsLayer));
    });

    it('[R12] [Then] a metadata-only update preserves the active plaintext fallback', () => {
      const homedir = tempy.temporaryDirectory();
      const first = makeUnavailableKeyring();
      const second = makeUnavailableKeyring();

      return Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          yield* ctx.login('fallback_key');
          yield* ctx.update({ orgId: Option.some('org_2') });
        }).pipe(Effect.provide(contextLayer({ homedir, keyring: first })));

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], 'fallback_key');
        assertEquals(onDisk['api_key_fallback'], true);
        assertEquals(onDisk['org_id'], 'org_2');

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'fallback_key');
          assertEquals(Option.getOrUndefined(ctx.data.orgId), 'org_2');
        }).pipe(Effect.provide(contextLayer({ homedir, keyring: second })));
      }).pipe(Effect.provide(fsLayer));
    });

    it('[R12] [Then] a metadata-only update preserves a pending logout tombstone', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring({
        alwaysFail: { delete: { kind: 'NoStorageAccess', cause: new Error('locked') } },
      });

      return Effect.gen(function* () {
        yield* seedUserDataFile(homedir, { api_key: null, pending_keyring_logout: true });

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          yield* ctx.update({ orgId: Option.some('org_3') });
        }).pipe(Effect.provide(contextLayer({ homedir, keyring })));

        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['pending_keyring_logout'], true);
        assertEquals(onDisk['org_id'], 'org_3');
      }).pipe(Effect.provide(fsLayer));
    });

    it('[Then] logout clears state whether the keyring entry is present, absent, or unreachable', () => {
      const runLogout = (keyring: FakeKeyring) =>
        Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          yield* ctx.logout;
          assertEquals(ctx.isLoggedIn(), false);
          assertEquals(ctx.credentialSource(), 'none');
        }).pipe(Effect.provide(contextLayer({ homedir: tempy.temporaryDirectory(), keyring })));

      return Effect.gen(function* () {
        const present = makeFakeKeyring({
          seed: [[KEYRING_SERVICE, KEYRING_USER, 'stored_key']],
        });
        yield* runLogout(present);
        assertEquals(present.peek(KEYRING_SERVICE, KEYRING_USER), undefined);

        const absent = makeFakeKeyring();
        yield* runLogout(absent);
        assertEquals(absent.operations().includes('delete'), true);

        const unreachable = makeUnavailableKeyring();
        yield* runLogout(unreachable);
        assertEquals(unreachable.operations().includes('delete'), true);
      }).pipe(Effect.provide(fsLayer));
    });

    it('[AE14] [Then] a failed replacement leaves the previous complete file intact', () => {
      const homedir = tempy.temporaryDirectory();
      const keyring = makeFakeKeyring();

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        // A permissive pre-existing file with complete state.
        yield* seedUserDataFile(homedir, { api_key: 'original_key', org_id: 'org_original' });
        yield* fs.chmod(userDataPath(homedir), 0o644);
        yield* fs.chmod(path.join(homedir, '.composio'), 0o500);

        yield* Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          yield* ctx.update({ orgId: Option.some('org_new') }).pipe(Effect.ignore);
        }).pipe(Effect.provide(contextLayer({ homedir, keyring })));

        yield* fs.chmod(path.join(homedir, '.composio'), 0o700);
        const onDisk = yield* readUserDataFile(homedir);
        assertEquals(onDisk['api_key'], 'original_key');
        assertEquals(onDisk['org_id'], 'org_original');

        // No temp file is left behind by the failed replacement.
        const leftovers = yield* fs.readDirectory(path.join(homedir, '.composio'));
        assertEquals(
          leftovers.filter(entry => entry.endsWith('.tmp')),
          []
        );
      }).pipe(Effect.provide(fsLayer));
    });
  });
});
