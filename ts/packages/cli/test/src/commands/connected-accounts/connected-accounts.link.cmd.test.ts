import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';

const testConnectedAccounts: ConnectedAccountItem[] = [
  {
    id: 'con_test_link',
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'default',
    toolkit: { slug: 'gmail' },
    auth_config: {
      id: 'ac_gmail_oauth',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    test_request_endpoint: '',
  },
];

const connectedAccountsData = {
  items: testConnectedAccounts,
} satisfies TestLiveInput['connectedAccountsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio connected-accounts link', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] valid --auth-config and --user-id [Then] creates link and waits (default)',
    it => {
      it.scoped('creates link and waits for ACTIVE', () =>
        Effect.gen(function* () {
          yield* cli([
            'connected-accounts',
            'link',
            '--auth-config',
            'ac_gmail_oauth',
            '--user-id',
            'default',
            '--no-browser',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('https://app.composio.dev/link?token=lt_test_token');
          expect(output).toContain('ACTIVE');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] valid --auth-config with explicit --user-id [Then] creates link',
    it => {
      it.scoped('uses explicit user-id', () =>
        Effect.gen(function* () {
          yield* cli([
            'connected-accounts',
            'link',
            '--auth-config',
            'ac_gmail_oauth',
            '--user-id',
            'default',
            '--no-browser',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('https://app.composio.dev/link');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData,
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] no --user-id and no project test_user_id [Then] falls back to global test_user_id',
    it => {
      it.scoped('uses global test user id from user_data.json', () =>
        Effect.gen(function* () {
          yield* cli([
            'connected-accounts',
            'link',
            '--auth-config',
            'ac_gmail_oauth',
            '--no-browser',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Using global test user id "global-default"');
          expect(output).toContain('https://app.composio.dev/link?token=lt_test_token');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['connected-accounts', 'link', '--auth-config', 'ac_test', '--no-browser']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] composio link alias [Then] works like composio connected-accounts link',
    it => {
      it.scoped('alias expands to connected-accounts link', () =>
        Effect.gen(function* () {
          yield* cli([
            'link',
            '--auth-config',
            'ac_gmail_oauth',
            '--user-id',
            'default',
            '--no-browser',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('https://app.composio.dev/link?token=lt_test_token');
          expect(output).toContain('ACTIVE');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] --no-wait [Then] outputs valid JSON parseable by jq',
    it => {
      it.scoped('prints JSON with status pending, connected_account_id, redirect_url', () =>
        Effect.gen(function* () {
          yield* cli([
            'connected-accounts',
            'link',
            '--auth-config',
            'ac_gmail_oauth',
            '--user-id',
            'default',
            '--no-browser',
            '--no-wait',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('"status"');
          expect(output).toContain('"pending"');
          expect(output).toContain('"message"');
          expect(output).toContain('"connected_account_id"');
          expect(output).toContain('con_test_link');
          expect(output).toContain('"redirect_url"');
          expect(output).toContain('https://app.composio.dev/link');
          // JSON is parseable
          const jsonMatch = output.match(/\{[\s\S]*"status"[\s\S]*\}/);
          expect(jsonMatch).toBeTruthy();
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            expect(parsed.status).toBe('pending');
            expect(parsed.connected_account_id).toBe('con_test_link');
          }
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] default (wait) [Then] waits for ACTIVE and outputs success JSON for jq',
    it => {
      it.scoped(
        'prints JSON with status success, message, connected_account_id, toolkit, redirect_url',
        () =>
          Effect.gen(function* () {
            yield* cli([
              'connected-accounts',
              'link',
              '--auth-config',
              'ac_gmail_oauth',
              '--user-id',
              'default',
              '--no-browser',
            ]);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            const output = lines.join('\n');

            expect(output).toContain('"status"');
            expect(output).toContain('"success"');
            expect(output).toContain('"message"');
            expect(output).toContain('ACTIVE');
            expect(output).toContain('"connected_account_id"');
            expect(output).toContain('con_test_link');
            expect(output).toContain('"toolkit"');
            expect(output).toContain('"gmail"');
            expect(output).toContain('"redirect_url"');
            expect(output).toContain('https://app.composio.dev/link');
          })
      );
    }
  );
});
