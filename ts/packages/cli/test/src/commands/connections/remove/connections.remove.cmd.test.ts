import { assert, describe, expect, layer } from '@effect/vitest';
import { isUsageFailure } from 'src/commands/errors';
import { ConfigProvider, Effect } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { MissingActingUserError } from 'src/commands/surface';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import {
  terminalUIWithConfirm,
  terminalUIWithoutPrompt,
} from 'test/__utils__/services/terminal-ui-test';

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

describe('CLI: composio connections remove', () => {
  const confirmedDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => confirmedDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithConfirm(true),
    })
  )(it => {
    it.effect('[Given] a unique toolkit selector and consent [Then] removes that connection', () =>
      Effect.gen(function* () {
        confirmedDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'remove', 'gmail']);

        expect(confirmedDeleteCalls).toEqual(['con_gmail_active']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.join('\n')).toContain('Removed gmail connection.');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      terminalUI: terminalUIWithConfirm(true),
    })
  )(it => {
    it.effect('[Given] the API rejects the removal [Then] fails naming the connected account', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['connectedAccounts'],
          routeRequests(
            [
              {
                method: 'DELETE',
                path: '/api/v3.1/connected_accounts/',
                respond: () =>
                  Response.json(
                    {
                      error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 },
                    },
                    { status: 403 }
                  ),
              },
            ],
            () =>
              Response.json({
                items: testConnections,
                total_items: testConnections.length,
                total_pages: 1,
                current_page: 1,
                next_cursor: null,
              })
          )
        );
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        const failure = yield* cli(['connections', 'remove', 'gmail']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({ _tag: 'commands/ConnectionsRemovalRequestError' });
        expect(extractErrorDetails(failure).message).toBe(
          'Failed to remove connected account "con_gmail_active".\nCaused by: 403 {"error":{"message":"Not allowed","code":1403,"slug":"Forbidden","status":403}}'
        );
      })
    );
  });

  const deniedDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => deniedDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithConfirm(false),
    })
  )(it => {
    it.effect('[Given] consent is denied [Then] does not remove the connection', () =>
      Effect.gen(function* () {
        deniedDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'remove', 'work']);

        expect(deniedDeleteCalls).toEqual([]);

        // Declining is not a failure: the command succeeds and the line says nothing changed.
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.at(-1)).toBe('No connection removed.');
      })
    );
  });

  const ambiguousDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => ambiguousDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithConfirm(true),
    })
  )(it => {
    it.effect(
      '[Given] a selector matches multiple accounts [Then] asks for a unique selector',
      () =>
        Effect.gen(function* () {
          ambiguousDeleteCalls.length = 0;

          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          const failure = yield* cli(['connections', 'remove', 'github']).pipe(Effect.flip);

          expect(ambiguousDeleteCalls).toEqual([]);
          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'connections remove',
            option: '<account>',
            message: expect.stringContaining('Multiple connections matched "github"'),
          });
        })
    );

    it.effect('[Given] a selector matches no account [Then] fails with a usage error', () =>
      Effect.gen(function* () {
        ambiguousDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        const failure = yield* cli(['connections', 'remove', 'nothing-matches']).pipe(Effect.flip);

        expect(ambiguousDeleteCalls).toEqual([]);
        expect(failure).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'connections remove',
          option: '<account>',
          message:
            'No connection matched "nothing-matches". Run `composio connections list` to inspect available connections.',
        });
      })
    );
  });

  const headlessDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => headlessDeleteCalls.push(nanoid),
      },
    })
  )(it => {
    it.effect(
      '[Given] no terminal and no --yes [Then] fails with a usage error before any request',
      () =>
        Effect.gen(function* () {
          headlessDeleteCalls.length = 0;

          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          const failure = yield* cli(['connections', 'remove', 'gmail']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'connections remove',
            option: '--yes',
            message: '`composio connections remove` needs --yes when not running interactively.',
          });
          expect(headlessDeleteCalls).toEqual([]);
          // Not even the connection list is fetched.
          // The invocation prints the message on stderr, and nothing else.
          assert(isUsageFailure(failure));
          expect(yield* MockConsole.getLines()).toEqual([failure.message]);
        })
    );

    it.effect('[Given] no terminal and --yes [Then] removes the connection without asking', () =>
      Effect.gen(function* () {
        headlessDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        // The headless test terminal answers a prompt with its default, "no", so a removal
        // proves no prompt ran.
        yield* cli(['connections', 'remove', 'gmail', '--yes']);

        expect(headlessDeleteCalls).toEqual(['con_gmail_active']);
      })
    );

    it.effect(
      '[Given] --yes and a selector that matches several connections [Then] removes nothing and fails with a usage error',
      () =>
        Effect.gen(function* () {
          headlessDeleteCalls.length = 0;

          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          const failure = yield* cli(['connections', 'remove', 'github', '--yes']).pipe(
            Effect.flip
          );

          // The invocation prints the message on stderr and exits 1.
          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'connections remove',
            option: '<account>',
            message: expect.stringContaining('Multiple connections matched "github"'),
          });
          expect(headlessDeleteCalls).toEqual([]);
        })
    );

    it.effect(
      '[Given] --yes and a selector that matches no connection [Then] removes nothing and fails with a usage error',
      () =>
        Effect.gen(function* () {
          headlessDeleteCalls.length = 0;

          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          const failure = yield* cli(['connections', 'remove', 'nothing-matches', '-y']).pipe(
            Effect.flip
          );

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'connections remove',
            option: '<account>',
            message:
              'No connection matched "nothing-matches". Run `composio connections list` to inspect available connections.',
          });
          expect(headlessDeleteCalls).toEqual([]);
        })
    );
  });

  const interactiveYesDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => interactiveYesDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithoutPrompt,
    })
  )(it => {
    it.effect('[Given] a terminal and -y [Then] removes the connection without asking', () =>
      Effect.gen(function* () {
        interactiveYesDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'remove', 'gmail', '-y']);

        expect(interactiveYesDeleteCalls).toEqual(['con_gmail_active']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.at(-1)).toBe('Removed gmail connection.');
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
          const failure = yield* cli(['connections', 'remove', 'gmail', '--yes']).pipe(Effect.flip);

          // An empty id counts as no user, so the removal fails before resolving any account.
          expect(failure).toBeInstanceOf(MissingActingUserError);
          expect(failure).toMatchObject({
            message: 'Missing consumer user id. Run `composio login` and try again.',
          });
        })
    );
  });
});
