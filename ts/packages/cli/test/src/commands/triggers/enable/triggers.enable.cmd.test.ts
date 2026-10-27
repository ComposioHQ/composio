import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { isUsageFailure } from 'src/commands/errors';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
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

describe('CLI: composio dev triggers enable', () => {
  layer(TestLive(dangerousDevConfig))('[Given] enable with ID [Then] enables trigger', it => {
    it.effect('enables trigger successfully', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'enable', 'trg_123']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('enabled');
      })
    );
  });

  layer(TestLive(dangerousDevConfig))(
    '[Given] missing ID for enable [Then] fails with a usage error before any request',
    it => {
      it.effect('raises a CommandInputError naming <id>', () =>
        Effect.gen(function* () {
          // Every repository method dies, so reaching the API fails the test.
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({})
          );
          const failure = yield* cli(['dev', 'triggers', 'enable']).pipe(
            Effect.provide(repository),
            Effect.flip
          );

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'dev triggers enable',
            option: '<id>',
            message: expect.stringMatching(
              /^Missing required argument: <id>\n[\s\S]*> composio dev triggers status --show-disabled$/
            ),
          });
          // `cli-main.ts` prints a usage failure on stderr and exits 1.
          expect(isUsageFailure(failure)).toBe(true);
          expect(yield* MockConsole.getLines()).toEqual([]);
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] the API rejects the enable [Then] reports the failure and exits 1',
    it => {
      it.effect('prints the fallback message and the status hint', () =>
        Effect.gen(function* () {
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              enableTrigger: () => Effect.fail(notFoundError('Trigger not found')),
            })
          );
          const exit = yield* Effect.exit(
            cli(['dev', 'triggers', 'enable', 'trg_missing']).pipe(Effect.provide(repository))
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Failed to enable trigger "trg_missing".');
          expect(output).toContain('composio dev triggers status --show-disabled');
          expect(output).not.toContain('Trigger "trg_missing" enabled.');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );
});
