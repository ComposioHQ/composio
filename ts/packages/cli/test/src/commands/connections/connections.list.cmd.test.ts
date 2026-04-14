import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const testConnections: ConnectedAccountItem[] = [
  {
    id: 'con_gmail_active',
    alias: null,
    word_id: null,
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
  {
    id: 'con_github_work',
    alias: 'work',
    word_id: null,
    status: 'ACTIVE',
    status_reason: null,
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
  {
    id: 'con_github_personal',
    alias: 'personal',
    word_id: null,
    status: 'FAILED',
    status_reason: 'Token expired',
    is_disabled: false,
    user_id: 'default',
    toolkit: { slug: 'github' },
    auth_config: {
      id: 'ac_github_oauth_2',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-02-03T00:00:00Z',
    updated_at: '2026-02-12T00:00:00Z',
    test_request_endpoint: '',
  },
];

const connectedAccountsData = {
  items: testConnections,
} satisfies TestLiveInput['connectedAccountsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio connections list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.scoped('[Given] no filter [Then] prints connection JSON with aliases for duplicates', () =>
      Effect.gen(function* () {
        const write = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);

        yield* cli(['connections', 'list']);

        const output = write.mock.calls.map(call => String(call[0])).join('');
        const parsed = JSON.parse(output) as Array<Record<string, string>>;

        expect(parsed).toEqual([
          { toolkit: 'gmail', status: 'ACTIVE' },
          { toolkit: 'github', status: 'ACTIVE', alias: 'work' },
          { toolkit: 'github', status: 'FAILED', alias: 'personal' },
        ]);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.scoped('[Given] --toolkit github [Then] filters the JSON output', () =>
      Effect.gen(function* () {
        const write = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);

        yield* cli(['connections', 'list', '--toolkit', 'github']);

        const output = write.mock.calls.map(call => String(call[0])).join('');
        const parsed = JSON.parse(output) as Array<Record<string, string>>;

        expect(parsed).toEqual([
          { toolkit: 'github', status: 'ACTIVE', alias: 'work' },
          { toolkit: 'github', status: 'FAILED', alias: 'personal' },
        ]);
      })
    );
  });
});
