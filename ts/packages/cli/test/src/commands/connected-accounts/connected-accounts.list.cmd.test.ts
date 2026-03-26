import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';

const testConnectedAccounts: ConnectedAccountItem[] = [
  {
    id: 'con_gmail_active',
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
    test_request_endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
  },
  {
    id: 'con_slack_active',
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'user-123',
    toolkit: { slug: 'slack' },
    auth_config: {
      id: 'ac_slack_oauth',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
    test_request_endpoint: '',
  },
  {
    id: 'con_github_expired',
    status: 'EXPIRED',
    status_reason: 'Token expired',
    is_disabled: false,
    user_id: 'default',
    toolkit: { slug: 'github' },
    auth_config: {
      id: 'ac_github_oauth',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
    test_request_endpoint: '',
  },
];

const connectedAccountsData = {
  items: testConnectedAccounts,
} satisfies TestLiveInput['connectedAccountsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev connected-accounts list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] no flags [Then] lists all connected accounts',
    it => {
      it.scoped('lists all connected accounts with table', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('con_gmail_active');
          expect(output).toContain('con_slack_active');
          expect(output).toContain('con_github_expired');
          expect(output).toContain('Listing 3 of 3 connected accounts');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] --toolkits "gmail" [Then] lists only gmail connected accounts',
    it => {
      it.scoped('filters by toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list', '--toolkits', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('con_gmail_active');
          expect(output).not.toContain('con_slack_active');
          expect(output).toContain('Listing 1 of 1 connected accounts');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] --user-id "default" [Then] lists only default user accounts',
    it => {
      it.scoped('filters by user ID', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list', '--user-id', 'default']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('con_gmail_active');
          expect(output).toContain('con_github_expired');
          expect(output).not.toContain('con_slack_active');
          expect(output).toContain('Listing 2 of 2 connected accounts');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] --status ACTIVE [Then] lists only active accounts',
    it => {
      it.scoped('filters by status', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list', '--status', 'ACTIVE']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('con_gmail_active');
          expect(output).toContain('con_slack_active');
          expect(output).not.toContain('con_github_expired');
          expect(output).toContain('Listing 2 of 2 connected accounts');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] --limit 1 [Then] respects limit',
    it => {
      it.scoped('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 1 of 3 connected accounts');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'connected-accounts', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] empty results [Then] shows no connected accounts found',
    it => {
      it.scoped('shows no connected accounts found', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No connected accounts found');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] --toolkits "nonexistent" [Then] shows hint about toolkit slug',
    it => {
      it.scoped('shows toolkit hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'list', '--toolkits', 'nonexistent']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No connected accounts found');
          expect(output).toContain('composio dev toolkits list');
        })
      );
    }
  );
});
