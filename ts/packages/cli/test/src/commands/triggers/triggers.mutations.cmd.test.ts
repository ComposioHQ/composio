import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const dangerousDevConfig = {
  baseConfigProvider: testConfigProvider,
  cliUserConfig: { developerDangerousCommandsEnabled: true },
} as const;

describe('CLI: composio dev triggers mutations', () => {
  layer(TestLive(dangerousDevConfig))(
    '[Given] create with valid args [Then] creates trigger',
    it => {
      it.scoped('creates trigger and prints id', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--connected-account-id',
            'con_123',
            '--dangerously-allow',
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
      it.scoped('rejects invalid trigger config JSON', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--trigger-config',
            '{',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Invalid JSON in --trigger-config');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))('[Given] enable with ID [Then] enables trigger', it => {
    it.scoped('enables trigger successfully', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'enable', 'trg_123', '--dangerously-allow']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('enabled');
      })
    );
  });

  layer(TestLive(dangerousDevConfig))('[Given] disable with ID [Then] disables trigger', it => {
    it.scoped('disables trigger successfully', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'disable', 'trg_123', '--dangerously-allow']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('disabled');
      })
    );
  });

  layer(TestLive(dangerousDevConfig))(
    '[Given] create with non-object JSON config [Then] shows type validation error',
    it => {
      it.scoped('rejects array JSON in --trigger-config', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--trigger-config',
            '[1,2,3]',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('--trigger-config must be a JSON object');
        })
      );

      it.scoped('rejects number JSON in --trigger-config', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--trigger-config',
            '42',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('--trigger-config must be a JSON object');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] missing ID for enable [Then] warns about missing argument',
    it => {
      it.scoped('shows missing id warning', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'enable', '--dangerously-allow']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))(
    '[Given] missing ID for disable [Then] warns about missing argument',
    it => {
      it.scoped('shows missing id warning', () =>
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

describe('CLI: composio dev triggers create --if-missing', () => {
  const existingItem = {
    id: 'ti_existing',
    trigger_name: 'GMAIL_NEW_GMAIL_MESSAGE',
    user_id: 'user_1',
    connected_account_id: 'con_123',
    disabled_at: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  layer(TestLive({ ...dangerousDevConfig, triggersData: { items: [existingItem] } }))(
    '[Given] an active instance of the trigger type already exists',
    it => {
      it.scoped('[Then] skips creation and prints the existing instance', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'create',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--if-missing',
            '--dangerously-allow',
          ]);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('already active - skipping');
          expect(output).toContain('ti_existing');
          expect(output).not.toContain('Trigger created');
        })
      );
    }
  );

  layer(TestLive(dangerousDevConfig))('[Given] no active instance exists', it => {
    it.scoped('[Then] creates the trigger normally', () =>
      Effect.gen(function* () {
        yield* cli([
          'dev',
          'triggers',
          'create',
          'GMAIL_NEW_GMAIL_MESSAGE',
          '--connected-account-id',
          'con_123',
          '--if-missing',
          '--dangerously-allow',
        ]);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Trigger created');
      })
    );
  });
});
