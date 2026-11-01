import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Console, Effect } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

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

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio connections list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.effect('[Given] no filter [Then] prints connection JSON with aliases for duplicates', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).toEqual({
          gmail: [{ id: 'con_gmail_active', status: 'ACTIVE', permission_group: null }],
          github: [
            {
              id: 'con_github_work',
              status: 'ACTIVE',
              alias: 'work',
              word_id: 'castle',
              permission_group: null,
            },
            {
              id: 'con_github_personal',
              status: 'FAILED',
              alias: 'personal',
              word_id: 'forest',
              permission_group: null,
            },
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
    it.effect('[Given] interactive stdout [Then] still prints the JSON payload', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).toEqual({
          gmail: [{ id: 'con_gmail_active', status: 'ACTIVE', permission_group: null }],
          github: [
            {
              id: 'con_github_work',
              status: 'ACTIVE',
              alias: 'work',
              word_id: 'castle',
              permission_group: null,
            },
            {
              id: 'con_github_personal',
              status: 'FAILED',
              alias: 'personal',
              word_id: 'forest',
              permission_group: null,
            },
          ],
        });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.effect('[Given] --toolkit github [Then] filters the JSON output', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list', '--toolkit', 'github']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).toEqual({
          github: [
            {
              id: 'con_github_work',
              status: 'ACTIVE',
              alias: 'work',
              word_id: 'castle',
              permission_group: null,
            },
            {
              id: 'con_github_personal',
              status: 'FAILED',
              alias: 'personal',
              word_id: 'forest',
              permission_group: null,
            },
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
    it.effect('[Given] mixed user scopes [Then] only consumer-project connections are listed', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).not.toHaveProperty('slack');
      })
    );
  });
});

describe('CLI: composio connections list account identity', () => {
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: [
          {
            ...testConnections[0]!,
            id: 'con_notion_team',
            alias: 'team',
            word_id: 'harbor',
            toolkit: { slug: 'notion' },
          },
        ],
      },
    })
  )(it => {
    it.effect('[Given] the only account of a toolkit has an alias [Then] prints id and alias', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).toEqual({
          notion: [
            {
              id: 'con_notion_team',
              status: 'ACTIVE',
              alias: 'team',
              word_id: 'harbor',
              permission_group: null,
            },
          ],
        });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.effect('[Given] state.val.displayName [Then] prints display_name and no credentials', () =>
      Effect.gen(function* () {
        const rawItem = {
          ...testConnections[0]!,
          id: 'con_gmail_named',
          alias: 'work',
          state: {
            authScheme: 'OAUTH2',
            val: {
              displayName: '  ada@example.com  ',
              access_token: 'must-not-leak',
              refresh_token: 'must-not-leak',
            },
          },
          data: { access_token: 'must-not-leak' },
          params: { refresh_token: 'must-not-leak' },
        };
        const stub = stubClientResources(
          ['connectedAccounts'],
          routeRequests(
            [
              {
                method: 'GET',
                path: '/api/v3.1/connected_accounts',
                respond: () =>
                  Response.json({
                    items: [rawItem],
                    total_items: 1,
                    total_pages: 1,
                    current_page: 1,
                    next_cursor: null,
                  }),
              },
            ],
            () => Response.json({ items: testConnections, next_cursor: null })
          )
        );
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']).pipe(Effect.provide(stub.layer));

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).toEqual({
          gmail: [
            {
              id: 'con_gmail_named',
              status: 'ACTIVE',
              alias: 'work',
              display_name: 'ada@example.com',
              permission_group: null,
            },
          ],
        });
        expect(output).not.toContain('must-not-leak');
        expect(output).not.toContain('access_token');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      accountData: { consumerUserId: '' },
    })
  )(it => {
    it.effect(
      '[Given] an empty consumer user id [Then] fails with the missing-user error and its message',
      () =>
        Effect.gen(function* () {
          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          const failure = yield* cli(['connections', 'list']).pipe(Effect.flip);

          // An empty id counts as no user; the tag is what `cli.command.failed` reports.
          expect(failure).toMatchObject({
            _tag: 'commands/MissingActingUserError',
            message: 'Missing consumer user id. Run `composio login` and try again.',
          });
        })
    );
  });
});
