import { assert, describe, expect, layer } from '@effect/vitest';
import { isUsageFailure } from 'src/commands/errors';
import { ConfigProvider, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
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

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio dev connected-accounts whoami', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] active connection [Then] shows account details',
    it => {
      it.effect('displays whoami for active connection', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'whoami', 'con_gmail_active']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('con_gmail_active');
          expect(output).toContain('gmail');
          expect(output).toContain('default');
          expect(output).toContain('ACTIVE');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] expired connection [Then] shows details with status warning',
    it => {
      it.effect('shows warning for non-ACTIVE connection', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'whoami', 'con_github_expired']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('con_github_expired');
          expect(output).toContain('EXPIRED');
          expect(output).toContain('status EXPIRED');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] nonexistent ID [Then] shows error with hint',
    it => {
      it.effect('shows error for nonexistent account', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            cli(['dev', 'connected-accounts', 'whoami', 'con_nonexistent'])
          );
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
          expect(output).toContain('composio dev connected-accounts list');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(
    '[Given] no ID argument [Then] fails with a usage error',
    it => {
      it.effect('raises a CommandInputError naming <id>', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'connected-accounts', 'whoami']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            option: '<id>',
            message: expect.stringMatching(
              /^Missing required argument: <id>\n[^]*composio dev connected-accounts whoami /
            ),
          });
          // The invocation prints the message on stderr, and nothing else.
          assert(isUsageFailure(failure));
          expect(yield* MockConsole.getLines()).toEqual([failure.message]);
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'connected-accounts', 'whoami', 'con_gmail_active']).pipe(
          Effect.flip
        );
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});
