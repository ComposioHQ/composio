import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { TriggerInstanceItem } from 'src/models/triggers';

const testTriggers: TriggerInstanceItem[] = [
  {
    id: 'trg_active_1',
    uuid: 'uuid-trg-active-1',
    trigger_name: 'GMAIL_NEW_GMAIL_MESSAGE',
    connected_account_id: 'con_gmail_1',
    auth_config_id: 'ac_gmail_1',
    user_id: 'user_default',
    disabled_at: null,
    updated_at: '2026-02-01T00:00:00Z',
    trigger_data: '',
    state: {},
    trigger_config: {},
  },
  {
    id: 'trg_active_2',
    uuid: 'uuid-trg-active-2',
    trigger_name: 'SLACK_NEW_MESSAGE',
    connected_account_id: 'con_slack_1',
    auth_config_id: 'ac_slack_1',
    user_id: 'user_123',
    disabled_at: null,
    updated_at: '2026-02-02T00:00:00Z',
    trigger_data: '',
    state: {},
    trigger_config: {},
  },
  {
    id: 'trg_disabled_1',
    uuid: 'uuid-trg-disabled-1',
    trigger_name: 'GITHUB_COMMIT_EVENT',
    connected_account_id: 'con_github_1',
    auth_config_id: 'ac_github_1',
    user_id: 'user_default',
    disabled_at: '2026-02-03T00:00:00Z',
    updated_at: '2026-02-03T00:00:00Z',
    trigger_data: '',
    state: {},
    trigger_config: {},
  },
];

const triggersData = {
  items: testTriggers,
} satisfies TestLiveInput['triggersData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev triggers status', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, triggersData }))(
    '[Given] no flags [Then] lists active triggers only',
    it => {
      it.scoped('lists active trigger instances', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_1');
          expect(output).toContain('trg_active_2');
          expect(output).not.toContain('trg_disabled_1');
          expect(output).toContain('Listing 2 of 2 triggers');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, triggersData }))(
    '[Given] --show-disabled [Then] includes disabled triggers',
    it => {
      it.scoped('includes disabled trigger instances', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--show-disabled']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_1');
          expect(output).toContain('trg_disabled_1');
          expect(output).toContain('Listing 3 of 3 triggers');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, triggersData }))(
    '[Given] --user-ids [Then] filters by user IDs',
    it => {
      it.scoped('filters by user_ids', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--user-ids', 'user_123']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_2');
          expect(output).not.toContain('trg_active_1');
          expect(output).toContain('Listing 1 of 1 triggers');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, triggersData }))(
    '[Given] --trigger-names lowercase [Then] applies case-insensitive filter',
    it => {
      it.scoped('normalizes trigger names to uppercase', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'triggers',
            'status',
            '--trigger-names',
            'gmail_new_gmail_message',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_1');
          expect(output).not.toContain('trg_active_2');
          expect(output).toContain('Listing 1 of 1 triggers');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, triggersData }))(
    '[Given] --toolkits [Then] filters by toolkit slug',
    it => {
      it.scoped('filters by toolkit prefix in trigger name', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--toolkits', 'slack']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_2');
          expect(output).not.toContain('trg_active_1');
          expect(output).toContain('Listing 1 of 2 triggers');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'status']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
