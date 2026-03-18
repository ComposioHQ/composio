import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio manage triggers mutations', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] create with valid args [Then] creates trigger',
    it => {
      it.scoped('creates trigger and prints id', () =>
        Effect.gen(function* () {
          yield* cli([
            'manage',
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

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] create with invalid JSON config [Then] shows JSON validation error',
    it => {
      it.scoped('rejects invalid trigger config JSON', () =>
        Effect.gen(function* () {
          yield* cli([
            'manage',
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

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] enable with ID [Then] enables trigger',
    it => {
      it.scoped('enables trigger successfully', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'triggers', 'enable', 'trg_123']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('enabled');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] disable with ID [Then] disables trigger',
    it => {
      it.scoped('disables trigger successfully', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'triggers', 'disable', 'trg_123']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('disabled');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] delete with --yes [Then] deletes trigger',
    it => {
      it.scoped('deletes trigger successfully', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'triggers', 'delete', 'trg_123', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('deleted');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] create with non-object JSON config [Then] shows type validation error',
    it => {
      it.scoped('rejects array JSON in --trigger-config', () =>
        Effect.gen(function* () {
          yield* cli([
            'manage',
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

      it.scoped('rejects number JSON in --trigger-config', () =>
        Effect.gen(function* () {
          yield* cli([
            'manage',
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

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] missing ID for enable [Then] warns about missing argument',
    it => {
      it.scoped('shows missing id warning', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'triggers', 'enable']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] missing ID for disable [Then] warns about missing argument',
    it => {
      it.scoped('shows missing id warning', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'triggers', 'disable']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] missing ID for delete [Then] warns about missing argument',
    it => {
      it.scoped('shows missing id warning', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'triggers', 'delete']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Missing required argument');
        })
      );
    }
  );
});
