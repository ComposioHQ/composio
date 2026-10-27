import { afterEach } from 'vitest';
import { describe, expect, layer } from '@effect/vitest';
import * as FileSystem from 'effect/FileSystem';
import { ConfigProvider, Effect, Option } from 'effect';
import path from 'node:path';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { UserDataWithDefaults } from 'src/models/user-data';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import {
  terminalUIWithConfirm,
  terminalUIWithoutPrompt,
} from 'test/__utils__/services/terminal-ui-test';

/** Whether `~/.composio/agent.json` still holds the agent identity. */
const agentConfigExists = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const cacheDir = yield* setupCacheDir;
  return yield* fs.exists(path.join(cacheDir, 'agent.json'));
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
  afterEach(() => {
    process.exitCode = undefined;
  });

  describe('[When] logged out', () => {
    layer(TestLive())(it => {
      it.effect('[Then] it is idempotent', () =>
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
    const testConfigProvider = ConfigProvider.fromEnv({
      env: { COMPOSIO_USER_API_KEY: 'api_key_already_logged_in' },
    });

    layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
      it.effect('[Then] it persists user data', () =>
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
      it.effect('[Then] cancelling keeps user and agent credentials', () =>
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
          // Declining is not a failure.
          expect(process.exitCode).toBeUndefined();
          expect(ctx.isLoggedIn()).toBeTruthy();
          expect(agentConfigExists).toBe(true);
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('[Then] without a terminal and --yes it fails and removes nothing', () =>
        Effect.gen(function* () {
          const ctx = yield* setupLoggedInAgent;

          const failure = yield* cli(['logout']).pipe(Effect.flip);

          // `cli-main.ts` prints the message on stderr and exits 1.
          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'logout',
            option: '--yes',
            message:
              '`composio logout` needs --yes when not running interactively: it removes the stored Composio agent key.',
          });
          expect(yield* MockConsole.getLines()).toEqual([]);
          expect(ctx.isLoggedIn()).toBeTruthy();
          expect(yield* agentConfigExists).toBe(true);
        })
      );
    });

    layer(TestLive({ terminalUI: terminalUIWithoutPrompt }))(it => {
      it.effect.each([['--yes'], ['-y'], ['-f']])(
        '[Then] %s on a terminal logs out without asking',
        ([flag]) =>
          Effect.gen(function* () {
            const ctx = yield* setupLoggedInAgent;

            yield* cli(['logout', flag]);

            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).not.toContain('Agent Logout Warning');
            expect(output).toContain('removed stored Composio agent key');
            expect(ctx.isLoggedIn()).toBeFalsy();
            expect(yield* agentConfigExists).toBe(false);
          })
      );
    });

    layer(TestLive())(it => {
      it.effect('[Then] --force removes user and agent credentials', () =>
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
