import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { UserDataWithDefaults } from 'src/models/user-data';
import { extendConfigProvider } from 'src/services/config';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio logout', () => {
  describe('[When] logged out', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] it is idempotent', () =>
        Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;

          expect(ctx.isLoggedIn()).toBeFalsy();
          const expectedUserData = UserDataWithDefaults.make({
            apiKey: Option.none(),
            baseURL: 'https://backend.composio.dev',
            webURL: 'https://platform.composio.dev',
          });

          expect(ctx.data).toMatchObject(expectedUserData);

          const args = ['logout'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toMatchInlineSnapshot(
            `"You are not logged in yet. Please run \`composio login\`."`
          );
          expect(ctx.isLoggedIn()).toBeFalsy();
          expect(ctx.data).toMatchObject(expectedUserData);
        })
      );
    });
  });

  describe('[When] logged in', () => {
    const testConfigProvider = ConfigProvider.fromMap(
      new Map([['COMPOSIO_API_KEY', 'api_key_already_logged_in']])
    ).pipe(extendConfigProvider);

    layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
      it.scoped('[Then] it persists user data', () =>
        Effect.gen(function* () {
          const ctx = yield* ComposioUserContext;
          expect(ctx.isLoggedIn()).toBeTruthy();
          expect(ctx.data).toMatchObject(
            UserDataWithDefaults.make({
              apiKey: Option.some('api_key_already_logged_in'),
              baseURL: 'https://backend.composio.dev',
              webURL: 'https://platform.composio.dev',
            })
          );

          const args = ['logout'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toMatchInlineSnapshot(`"Logged out successfully."`);
          expect(ctx.isLoggedIn()).toBeFalsy();
        })
      );
    });
  });
});
