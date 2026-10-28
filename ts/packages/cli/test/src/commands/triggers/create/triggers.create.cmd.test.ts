import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import type { TriggerInstanceUpsertParams } from '@composio/client/resources/trigger-instances';
import { isUsageFailure } from 'src/commands/errors';
import { projectKeysFromJSON } from 'src/models/project-keys';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { notFoundError } from 'test/__utils__/layers/not-found';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const dangerousDevConfig = {
  baseConfigProvider: testConfigProvider,
  cliUserConfig: { developerDangerousCommandsEnabled: true },
} as const;

const createArgs = [
  'triggers',
  'create',
  'GMAIL_NEW_GMAIL_MESSAGE',
  '--connected-account-id',
  'con_123',
  '--trigger-config',
  '{"label":"inbox"}',
];

const userCases = [
  {
    name: '--user-id before the subcommand overrides both defaults',
    args: ['dev', '--user-id', 'alice', ...createArgs],
    projectUserId: 'project-user',
    globalUserId: 'global-user',
    expectedUserId: 'alice',
    expectedLog: undefined,
  },
  {
    name: '--user-id after the subcommand overrides both defaults',
    args: ['dev', ...createArgs, '--user-id', 'alice'],
    projectUserId: 'project-user',
    globalUserId: 'global-user',
    expectedUserId: 'alice',
    expectedLog: undefined,
  },
  {
    name: 'the project test user takes precedence over the global one',
    args: ['dev', ...createArgs],
    projectUserId: 'project-user',
    globalUserId: 'global-user',
    expectedUserId: 'project-user',
    expectedLog: 'Using test user id "project-user"',
  },
  {
    name: 'the global test user is used without a project test user',
    args: ['dev', ...createArgs],
    projectUserId: undefined,
    globalUserId: 'global-user',
    expectedUserId: 'global-user',
    expectedLog: 'Using global test user id "global-user"',
  },
  {
    name: 'a connection can still be used without a configured test user',
    args: ['dev', ...createArgs],
    projectUserId: undefined,
    globalUserId: undefined,
    expectedUserId: undefined,
    expectedLog: undefined,
  },
];

describe('CLI: composio dev triggers create', () => {
  layer(TestLive(dangerousDevConfig))(
    '[Given] a user id source [Then] sends the selected user id',
    it => {
      it.effect.each(userCases)(
        '$name',
        ({ args, projectUserId, globalUserId, expectedUserId, expectedLog }) =>
          Effect.gen(function* () {
            const previousLines = (yield* MockConsole.getLines()).length;
            const userContext = yield* ComposioUserContext;
            yield* userContext.login('test_api_key', 'org_test', globalUserId);
            const project = yield* projectKeysFromJSON(
              JSON.stringify({
                org_id: 'org_test',
                project_id: 'proj_test',
                test_user_id: projectUserId,
              })
            );
            const calls: Array<{ slug: string; params?: TriggerInstanceUpsertParams }> = [];
            const repository = Layer.succeed(
              ComposioToolkitsRepository,
              makeToolkitsRepositoryStub({
                createTrigger: (slug, params) =>
                  Effect.sync(() => {
                    calls.push({ slug, params });
                    return { trigger_id: 'trg_new' };
                  }),
              })
            );
            const projectContext = Layer.succeed(
              ProjectContext,
              ProjectContext.of({ resolve: Effect.succeed(Option.some(project)) })
            );

            yield* cli(args).pipe(Effect.provide(Layer.merge(repository, projectContext)));

            expect(calls).toEqual([
              {
                slug: 'GMAIL_NEW_GMAIL_MESSAGE',
                params: {
                  connected_account_id: 'con_123',
                  trigger_config: { label: 'inbox' },
                  user_id: expectedUserId,
                },
              },
            ]);
            const logs = (yield* MockConsole.getLines({ stripAnsi: true }))
              .slice(previousLines)
              .filter(line => line.includes('test user id'));
            expect(logs).toEqual(
              expectedLog === undefined ? [] : [expect.stringContaining(expectedLog)]
            );
          })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] create with valid args [Then] creates trigger',
    it => {
      it.effect('creates trigger and prints id', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--connected-account-id',
            'con_123',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Trigger created');
          expect(output).toContain('trg_gmail_new_gmail_message_con_123');
          expect(lines.at(-1)).toBe(
            JSON.stringify({ trigger_id: 'trg_gmail_new_gmail_message_con_123' }, null, 2)
          );
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] create with a JSON object config [Then] sends it as the trigger config',
    it => {
      it.effect('passes the parsed config and connected account to the API', () =>
        Effect.gen(function* () {
          const calls: Array<{ slug: string; params?: TriggerInstanceUpsertParams }> = [];
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              createTrigger: (slug, params) =>
                Effect.sync(() => {
                  calls.push({ slug, params });
                  return { trigger_id: 'trg_new' };
                }),
            })
          );
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--connected-account-id',
            'con_123',
            '--trigger-config',
            '{"labelIds":"INBOX"}',
          ]).pipe(Effect.provide(repository));

          expect(calls).toEqual([
            {
              slug: 'GMAIL_NEW_GMAIL_MESSAGE',
              params: { connected_account_id: 'con_123', trigger_config: { labelIds: 'INBOX' } },
            },
          ]);
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] invalid input [Then] fails with a usage error before any request',
    it => {
      it.effect.each([
        {
          name: 'no trigger name',
          args: [],
          option: '<trigger-name>',
          message: /^Missing required argument: <trigger-name>\nTry specifying a trigger slug/,
        },
        {
          name: 'invalid JSON in --trigger-config',
          args: ['GMAIL_NEW_GMAIL_MESSAGE', '--trigger-config', '{'],
          option: '--trigger-config',
          message: /^Invalid JSON in --trigger-config\. Please provide valid JSON\.\nExample:\n/,
        },
        {
          name: 'a JSON array in --trigger-config',
          args: ['GMAIL_NEW_GMAIL_MESSAGE', '--trigger-config', '[1,2,3]'],
          option: '--trigger-config',
          message: /^--trigger-config must be a JSON object/,
        },
        {
          name: 'a JSON number in --trigger-config',
          args: ['GMAIL_NEW_GMAIL_MESSAGE', '--trigger-config', '42'],
          option: '--trigger-config',
          message: /^--trigger-config must be a JSON object/,
        },
      ])('[Given] $name [Then] raises a CommandInputError', ({ args, option, message }) =>
        Effect.gen(function* () {
          // Every repository method dies, so reaching the API fails the test.
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({})
          );
          const failure = yield* cli(['dev', 'triggers', 'create', ...args]).pipe(
            Effect.provide(repository),
            Effect.flip
          );

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'dev triggers create',
            option,
            message: expect.stringMatching(message),
          });
          // `cli-main.ts` prints a usage failure on stderr and exits 1.
          expect(isUsageFailure(failure)).toBe(true);
          expect(yield* MockConsole.getLines()).toEqual([]);
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] the API rejects the create [Then] reports the failure and exits 1',
    it => {
      it.effect('prints the fallback message and the list hint', () =>
        Effect.gen(function* () {
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              createTrigger: () => Effect.fail(notFoundError('Trigger type not found')),
            })
          );
          const exit = yield* Effect.exit(
            cli(['dev', 'triggers', 'create', 'UNKNOWN_TRIGGER']).pipe(Effect.provide(repository))
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Failed to create trigger "UNKNOWN_TRIGGER".');
          expect(output).toContain('composio dev triggers list');
          expect(output).not.toContain('Trigger created');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );
});
