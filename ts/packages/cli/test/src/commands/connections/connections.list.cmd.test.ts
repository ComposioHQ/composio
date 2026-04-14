import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { extendConfigProvider } from 'src/services/config';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const parseJsonFromLines = (lines: ReadonlyArray<string>) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as Record<string, Array<Record<string, string>>>;
    } catch {
      // continue
    }
  }
  throw new Error('Expected JSON output but none found');
};

const testConnections: ConnectedAccountItem[] = [
  {
    id: 'con_gmail_active',
    alias: null,
    word_id: null,
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'consumer-user-org_test',
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
    word_id: 'castle',
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'consumer-user-org_test',
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
    word_id: 'forest',
    status: 'FAILED',
    status_reason: 'Token expired',
    is_disabled: false,
    user_id: 'consumer-user-org_test',
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
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.scoped('[Given] no filter [Then] prints connection JSON with aliases for duplicates', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).toEqual({
          gmail: [{ status: 'ACTIVE' }],
          github: [
            { status: 'ACTIVE', alias: 'work', word_id: 'castle' },
            { status: 'FAILED', alias: 'personal', word_id: 'forest' },
          ],
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData,
      stdin: { isTTY: true, data: '' },
    })
  )(it => {
    it.scoped('[Given] interactive stdout [Then] still prints the JSON payload', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).toEqual({
          gmail: [{ status: 'ACTIVE' }],
          github: [
            { status: 'ACTIVE', alias: 'work', word_id: 'castle' },
            { status: 'FAILED', alias: 'personal', word_id: 'forest' },
          ],
        });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.scoped('[Given] --toolkit github [Then] filters the JSON output', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list', '--toolkit', 'github']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).toEqual({
          github: [
            { status: 'ACTIVE', alias: 'work', word_id: 'castle' },
            { status: 'FAILED', alias: 'personal', word_id: 'forest' },
          ],
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: [
          ...testConnections,
          {
            id: 'con_slack_dev_only',
            alias: null,
            word_id: null,
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'developer-user-org_test',
            toolkit: { slug: 'slack' },
            auth_config: {
              id: 'ac_slack_oauth',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-03-01T00:00:00Z',
            updated_at: '2026-03-05T00:00:00Z',
            test_request_endpoint: '',
          },
        ],
      },
    })
  )(it => {
    it.scoped('[Given] mixed user scopes [Then] only consumer-project connections are listed', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).not.toHaveProperty('slack');
      })
    );
  });
});
