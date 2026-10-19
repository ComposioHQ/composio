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
    '[Given] missing ID for disable [Then] warns about missing argument',
    it => {
      it.effect('shows missing id warning', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'disable', '--dangerously-allow']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument');
        })
      );
    }
  );
});
