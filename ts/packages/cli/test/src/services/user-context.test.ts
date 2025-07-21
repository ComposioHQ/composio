import { describe, it } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';
import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer, Option, Data } from 'effect';
import * as tempy from 'tempy';
import { ComposioUserContext, ComposioUserContextLive } from 'src/services/user-context';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { UserData, userDataToJSON } from 'src/models/user-data';
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

          const expectedUserData = UserData.make({
            apiKey: Option.none(),
            baseURL: Option.none(),
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

          const expectedUserData = UserData.make({
            apiKey: Option.some('api_key'),
            baseURL: Option.some('https://test.composio.localhost'),
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
          });
          const userDataAsJson = yield* userDataToJSON(expectedUserData);

          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), userDataAsJson);

          const ctx = yield* ComposioUserContext;
          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
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
          });
          const userDataAsJson = yield* userDataToJSON(expectedUserData);

          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
          yield* fs.writeFileString(path.join(cwd, '.composio', 'user_data.json'), userDataAsJson);

          const ctx = yield* ComposioUserContext;

          assertEquals(Data.struct(ctx.data), Data.struct(expectedUserData));
          assertEquals(ctx.isLoggedIn(), true);
        }).pipe(Effect.provide(ComposioUserContextTest));
      });
    });
  });
});
