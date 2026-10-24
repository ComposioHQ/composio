import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
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

describe('CLI: composio dev triggers disable', () => {
  layer(TestLive(dangerousDevConfig))('[Given] disable with ID [Then] disables trigger', it => {
    it.effect('disables trigger successfully', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'disable', 'trg_123', '--dangerously-allow']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('disabled');
      })
    );
  });

  layer(TestLive(dangerousDevConfig))(
    '[Given] missing ID for disable [Then] fails with a usage error',
    it => {
      it.effect('raises a CommandInputError naming <id>', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'triggers', 'disable', '--dangerously-allow']).pipe(
            Effect.flip
          );

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'dev triggers disable',
            option: '<id>',
            message: expect.stringMatching(
              /^Missing required argument: <id>\nTry specifying a trigger ID, e\.g\.:\n> composio dev triggers disable "trg_123"/
            ),
          });
          expect(yield* MockConsole.getLines()).toEqual([]);
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] disable without --dangerously-allow [Then] fails on that flag',
    it => {
      it.effect('raises a CommandInputError naming --dangerously-allow', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'triggers', 'disable', 'trg_123']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            option: '--dangerously-allow',
            message: expect.stringContaining('requires explicit acknowledgement'),
          });
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] destructive dev commands disabled by config [Then] fails before the flag check',
    it => {
      it.effect('raises a CommandInputError naming the config setting', () =>
        Effect.gen(function* () {
          const failure = yield* cli([
            'dev',
            'triggers',
            'disable',
            'trg_123',
            '--dangerously-allow',
          ]).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            message: expect.stringContaining('developer.destructive_actions'),
          });
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] the API rejects the disable [Then] reports the failure and exits 1',
    it => {
      it.effect('prints the fallback message and the status hint', () =>
        Effect.gen(function* () {
          const proc = recordingNodeProcess();
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              disableTrigger: () => Effect.fail(notFoundError('Trigger not found')),
            })
          );
          yield* cli(['dev', 'triggers', 'disable', 'trg_missing', '--dangerously-allow']).pipe(
            Effect.provide(Layer.merge(repository, proc.layer))
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Failed to disable trigger "trg_missing".');
          expect(output).toContain('composio dev triggers status');
          expect(output).not.toContain('Trigger "trg_missing" disabled.');
          expect(proc.exitCode()).toBe(1);
        })
      );
    }
  );
});
