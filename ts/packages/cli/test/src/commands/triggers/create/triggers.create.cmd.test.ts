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
});
