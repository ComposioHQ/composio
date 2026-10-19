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
    '[Given] missing ID for enable [Then] warns about missing argument',
    it => {
      it.effect('shows missing id warning', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'enable']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] the API rejects the enable [Then] reports the failure and exits 1',
    it => {
      it.effect('prints the fallback message and the status hint', () =>
        Effect.gen(function* () {
          const proc = recordingNodeProcess();
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              enableTrigger: () => Effect.fail(notFoundError('Trigger not found')),
            })
          );
          yield* cli(['dev', 'triggers', 'enable', 'trg_missing']).pipe(
            Effect.provide(Layer.merge(repository, proc.layer))
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Failed to enable trigger "trg_missing".');
          expect(output).toContain('composio dev triggers status --show-disabled');
          expect(output).not.toContain('Trigger "trg_missing" enabled.');
          expect(proc.exitCode()).toBe(1);
        })
      );
    }
  );
});
