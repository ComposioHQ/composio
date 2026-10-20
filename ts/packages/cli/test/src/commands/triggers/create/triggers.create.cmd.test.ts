import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import type { TriggerInstanceUpsertParams } from '@composio/client/resources/trigger-instances';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { notFoundError } from 'test/__utils__/layers/not-found';
import { recordingNodeProcess } from 'test/__utils__/services/node-process-test';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const dangerousDevConfig = {
  baseConfigProvider: testConfigProvider,
  cliUserConfig: { developerDangerousCommandsEnabled: true },
} as const;

describe('CLI: composio dev triggers create', () => {
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
    '[Given] create with invalid JSON config [Then] shows JSON validation error',
    it => {
      it.effect('rejects invalid trigger config JSON', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--trigger-config',
            '{',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Invalid JSON in --trigger-config');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] create with non-object JSON config [Then] shows type validation error',
    it => {
      it.effect('rejects array JSON in --trigger-config', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--trigger-config',
            '[1,2,3]',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('--trigger-config must be a JSON object');
        })
      );

      it.effect('rejects number JSON in --trigger-config', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--trigger-config',
            '42',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('--trigger-config must be a JSON object');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] create without a trigger name [Then] warns about missing argument',
    it => {
      it.effect('shows missing trigger-name warning', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'create']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument: <trigger-name>');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] the API rejects the create [Then] reports the failure and exits 1',
    it => {
      it.effect('prints the fallback message and the list hint', () =>
        Effect.gen(function* () {
          const proc = recordingNodeProcess();
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              createTrigger: () => Effect.fail(notFoundError('Trigger type not found')),
            })
          );
          yield* cli(['dev', 'triggers', 'create', 'UNKNOWN_TRIGGER']).pipe(
            Effect.provide(Layer.merge(repository, proc.layer))
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Failed to create trigger "UNKNOWN_TRIGGER".');
          expect(output).toContain('composio dev triggers list');
          expect(output).not.toContain('Trigger created');
          expect(proc.exitCode()).toBe(1);
        })
      );
    }
  );
});
