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
    test_request_endpoint: '',
  },
];

const connectedAccountsData = {
  items: testConnectedAccounts,
} satisfies TestLiveInput['connectedAccountsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio connected-accounts delete', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] valid ID with --yes [Then] deletes successfully',
    it => {
      it.scoped('deletes the connected account', () =>
        Effect.gen(function* () {
          yield* cli(['connected-accounts', 'delete', 'con_gmail_active', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('deleted');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] nonexistent ID with --yes [Then] shows error with hint',
    it => {
      it.scoped('shows error for nonexistent account', () =>
        Effect.gen(function* () {
          yield* cli(['connected-accounts', 'delete', 'con_nonexistent', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
          expect(output).toContain('composio connected-accounts list');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] no ID argument [Then] shows missing argument warning',
    it => {
      it.scoped('warns about missing argument', () =>
        Effect.gen(function* () {
          yield* cli(['connected-accounts', 'delete']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Missing required argument');
          expect(output).toContain('composio connected-accounts delete');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['connected-accounts', 'delete', 'con_gmail_active', '--yes']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
