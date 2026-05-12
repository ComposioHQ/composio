import { describe, expect, layer } from '@effect/vitest';
import { FileSystem } from '@effect/platform';
import { ConfigProvider, Console, Effect, Option } from 'effect';
import path from 'node:path';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { UserDataWithDefaults } from 'src/models/user-data';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { extendConfigProvider } from 'src/services/config';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';

const terminalUIWithConfirm = (confirmed: boolean) =>
  TerminalUI.of({
    output: data => Console.log(data),
    intro: title => Console.log(`-- ${title} --`),
    outro: message => Console.log(`-- ${message} --`),
    log: {
      info: message => Console.log(message),
      success: message => Console.log(message),
      warn: message => Console.warn(message),
      error: message => Console.error(message),
      step: message => Console.log(message),
      message: message => Console.log(message),
    },
    note: (message, title) => Console.log(title ? `[${title}] ${message}` : message),
    select: (_message, options) => Effect.succeed(options[0]!.value),
    confirm: () => Effect.succeed(confirmed),
    withSpinner: (message, effect, options) =>
      Effect.gen(function* () {
        const result = yield* effect;
        const successMsg =
          typeof options?.successMessage === 'function'
            ? options.successMessage(result)
            : (options?.successMessage ?? message);
        yield* Console.log(successMsg);
        return result;
      }),
    useMakeSpinner: (_message, use) =>
      use({
        message: (_msg: string) => Effect.void,
        stop: (msg?: string) => (msg ? Console.log(msg) : Effect.void),
        error: (msg?: string) => (msg ? Console.error(msg) : Effect.void),
      }),
  });

const setupLoggedInAgent = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  yield* writeStoredAgentIdentity({
    status: 'READY',
    slug: 'test-agent',
    email: 'test-agent@agent.composio.ai',
    composio_agent_key: 'cak_test_agent',
    composio: {
      org_id: 'org_agent',
      project_id: 'proj_agent',
      user_api_key: 'uak_agent',
    },
  });
  yield* ctx.login('uak_agent', 'org_agent');
  return ctx;
});

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
            webURL: 'https://dashboard.composio.dev/',
            orgId: Option.none(),
            projectId: Option.none(),
            testUserId: Option.none(),
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
      new Map([['COMPOSIO_USER_API_KEY', 'api_key_already_logged_in']])
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
              webURL: 'https://dashboard.composio.dev/',
              orgId: Option.none(),
              projectId: Option.none(),
              testUserId: Option.none(),
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

  describe('[When] logged in as an agent', () => {
    layer(TestLive({ terminalUI: terminalUIWithConfirm(false) }))(it => {
      it.scoped('[Then] cancelling keeps user and agent credentials', () =>
        Effect.gen(function* () {
          const ctx = yield* setupLoggedInAgent;

          yield* cli(['logout']);

          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          const agentConfigExists = yield* fs.exists(path.join(cacheDir, 'agent.json'));
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Agent Logout Warning');
          expect(output).toContain('composio_agent_key');
          expect(output).toContain('Agent logout cancelled');
          expect(ctx.isLoggedIn()).toBeTruthy();
          expect(agentConfigExists).toBe(true);
        })
      );
    });

    layer(TestLive())(it => {
      it.scoped('[Then] --force removes user and agent credentials', () =>
        Effect.gen(function* () {
          const ctx = yield* setupLoggedInAgent;

          yield* cli(['logout', '--force']);

          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          const agentConfigExists = yield* fs.exists(path.join(cacheDir, 'agent.json'));
          const userConfigRaw = yield* fs.readFileString(
            path.join(cacheDir, constants.USER_CONFIG_FILE_NAME),
            'utf8'
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('removed stored Composio agent key');
          expect(ctx.isLoggedIn()).toBeFalsy();
          expect(agentConfigExists).toBe(false);
          expect(JSON.parse(userConfigRaw)).toHaveProperty('api_key', null);
        })
      );
    });
  });
});
