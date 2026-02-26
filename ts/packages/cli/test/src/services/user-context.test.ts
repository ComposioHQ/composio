import { describe, it } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';
import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer, Option, Data } from 'effect';
import * as tempy from 'tempy';
import { ComposioUserContext, ComposioUserContextLive } from 'src/services/user-context';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { UserData, UserDataWithDefaults, userDataToJSON } from 'src/models/user-data';
import { extendConfigProvider } from 'src/services/config';
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
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.none(),
            baseURL: 'https://backend.composio.dev',
            webURL: 'https://platform.composio.dev',
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
          ['COMPOSIO_API_KEY', 'api_key'],
          ['COMPOSIO_BASE_URL', 'https://test.composio.localhost'],
        ]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;

          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.some('api_key'),
            baseURL: 'https://test.composio.localhost',
            webURL: 'https://platform.composio.dev',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), true);
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
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const expectedUserData = UserData.make({
            apiKey: Option.some('api_key'),
            baseURL: Option.some('https://test.composio.localhost'),
            webURL: Option.some('https://platform.composio.dev'),
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
        const map = new Map([['COMPOSIO_API_KEY', 'api_key']]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const expectedUserData = UserData.make({
            apiKey: Option.some('api_key'),
            baseURL: Option.none(),
            webURL: Option.some('https://platform.composio.dev'),
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
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
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
            webURL: 'https://platform.composio.dev',
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
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
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
            webURL: 'https://platform.composio.dev',
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
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
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
            webURL: 'https://platform.composio.dev',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
          });
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), false);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });

    describe('[When] the file is corrupted but env API_KEY is set', () => {
      it('[Then] it falls back to defaults but preserves env API_KEY', () => {
        const cwd = tempy.temporaryDirectory();
        const map = new Map([['COMPOSIO_API_KEY', 'env_api_key']]) satisfies Map<string, string>;

        const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
        const ComposioUserContextTest = Layer.provideMerge(
          ComposioUserContextLive,
          Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), '');

          const ctx = yield* ComposioUserContext;

          // Despite corrupted file, env API_KEY should still work
          assertEquals(ctx.isLoggedIn(), true);
          assertEquals(Option.getOrUndefined(ctx.data.apiKey), 'env_api_key');
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });
  });
});
