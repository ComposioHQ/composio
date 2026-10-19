import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';

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
});
