import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import type { ComposioClientShape } from '@composio/client/effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import {
  routeRequests,
  stubClientResources,
  type StubRequest,
} from 'test/__utils__/services/stub-composio-client';

const testLayer = () =>
  TestLive({
    baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
    fixture: 'global-test-user-id',
  });

const forbidden = () =>
  Response.json(
    { error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 } },
    { status: 403 }
  );
const FORBIDDEN_DETAIL =
  '403 {"error":{"message":"Not allowed","code":1403,"slug":"Forbidden","status":403}}';

const session = () =>
  Response.json({
    session_id: 'trs_stub_session',
    config: { user_id: 'consumer-user-org_test' },
    mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
    tool_router_tools: [],
  });

const failureOf = (
  args: ReadonlyArray<string>,
  resources: ReadonlyArray<keyof ComposioClientShape>,
  respond: (request: StubRequest) => Response = forbidden
) =>
  Effect.gen(function* () {
    const stub = stubClientResources(resources, respond);
    return yield* cli(args).pipe(Effect.provide(stub.layer), Effect.flip);
  });

const rejectedRequests: ReadonlyArray<{
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly resources: ReadonlyArray<keyof ComposioClientShape>;
  readonly tag: string;
  readonly message: string;
}> = [
  {
    command: 'dev logs tools <id>',
    args: ['dev', 'logs', 'tools', 'log_1'],
    resources: ['logs'],
    tag: 'commands/ToolLogsRequestError',
    message: 'Failed to fetch tool log "log_1".',
  },
  {
    command: 'dev logs triggers',
    args: ['dev', 'logs', 'triggers'],
    resources: ['_internal'],
    tag: 'commands/TriggerLogsRequestError',
    message: 'Failed to fetch trigger logs.',
  },
  {
    command: 'dev logs triggers <id>',
    args: ['dev', 'logs', 'triggers', 'log_1'],
    resources: ['_internal'],
    tag: 'commands/TriggerLogsRequestError',
    message: 'Failed to fetch trigger log "log_1".',
  },
  {
    command: 'connections list',
    args: ['connections', 'list'],
    resources: ['connectedAccounts'],
    tag: 'commands/ConnectionsListRequestError',
    message: 'Failed to list connections.',
  },
  {
    command: 'connections remove',
    // Without a terminal, removing needs --yes before any request is sent.
    args: ['connections', 'remove', 'gmail', '--yes'],
    resources: ['connectedAccounts'],
    tag: 'commands/ConnectionsRemovalRequestError',
    message: 'Failed to list connections.',
  },
  {
    command: 'dev connected-accounts list',
    args: ['dev', 'connected-accounts', 'list'],
    resources: ['connectedAccounts'],
    tag: 'commands/ConnectedAccountsListRequestError',
    message: 'Failed to list connected accounts.',
  },
  {
    command: 'link <toolkit> --list',
    args: ['link', 'gmail', '--list'],
    resources: ['connectedAccounts'],
    tag: 'commands/ConnectedAccountsRequestError',
    message: 'Failed to list connected accounts for "gmail".',
  },
];

describe('CLI: a request the API rejects', () => {
  describe.each(rejectedRequests)(
    '[Given] composio $command',
    ({ args, resources, tag, message }) => {
      layer(testLayer())(it => {
        it.effect(
          '[Then] the command fails with its own message and the response as the cause',
          () =>
            Effect.gen(function* () {
              const failure = yield* failureOf(args, resources);

              expect(failure).toMatchObject({ _tag: tag, message });
              expect(extractErrorDetails(failure).message).toBe(
                `${message}\nCaused by: ${FORBIDDEN_DETAIL}`
              );
            })
        );
      });
    }
  );

  layer(testLayer())('[Given] composio link while the new account cannot be fetched', it => {
    it.effect('[Then] the wait fails with the fetch message once its retries run out', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['connectedAccounts'],
          routeRequests(
            [
              {
                method: 'GET',
                path: '/api/v3.1/connected_accounts/con_test_link',
                respond: forbidden,
              },
            ],
            () => Response.json({ items: [], total_pages: 1, current_page: 1, total_items: 0 })
          )
        );
        const fiber = yield* cli(['link', 'gmail', '--no-browser']).pipe(
          Effect.provide(stub.layer),
          Effect.flip,
          Effect.forkChild
        );
        // Each retry waits on the test clock and then on the stub transport's promise.
        yield* TestClock.adjust('2 hours').pipe(
          Effect.andThen(TestClock.withLive(Effect.sleep('5 millis'))),
          Effect.repeat({ times: 40 })
        );
        const failure = yield* Fiber.join(fiber);

        expect(failure).toMatchObject({ _tag: 'commands/ConnectedAccountsRequestError' });
        expect(extractErrorDetails(failure).message).toBe(
          `Failed to fetch connected account "con_test_link".\nCaused by: ${FORBIDDEN_DETAIL}`
        );
      })
    );
  });
});

describe('CLI: a rejected request the command recovers from', () => {
  const SESSION_TOOLKITS = '/api/v3.1/tool_router/session/trs_stub_session/toolkits?toolkits=gmail';
  const toolkitsInfo = (toolkits: () => Response) =>
    Effect.gen(function* () {
      const stub = stubClientResources(
        ['toolRouter'],
        routeRequests([{ method: 'GET', path: SESSION_TOOLKITS, respond: toolkits }], session)
      );
      const exit = yield* Effect.exit(
        cli(['dev', 'toolkits', 'info', 'gmail']).pipe(Effect.provide(stub.layer))
      );
      const lines = yield* MockConsole.getLines({ stripAnsi: true });
      return { lines, lastPath: stub.requests.at(-1)?.path, exitCode: exitCodeOf(exit) };
    });

  layer(testLayer())('[Given] composio dev toolkits info and rejected session toolkits', it => {
    it.effect('[Then] the API message and the browse hint are printed', () =>
      Effect.gen(function* () {
        const { lines, lastPath, exitCode } = yield* toolkitsInfo(forbidden);

        expect(lines).toEqual([
          'Using global test user id "global-default"',
          'Not allowed',
          'Browse available toolkits:\n> composio dev toolkits list',
        ]);
        expect(lastPath).toBe(SESSION_TOOLKITS);
        expect(exitCode).toBe(1);
      })
    );
  });

  const LISTING = '/api/v3.1/connected_accounts?';
  const withoutExistingAccounts = () => stubClientResources(['connectedAccounts'], forbidden);
  const redirect = [
    'Open this URL in your browser to authorize',
    '[Redirect URL] https://app.composio.dev/link?token=lt_test_token',
  ];
  const pending = (fields: Record<string, string>) =>
    JSON.stringify(
      {
        status: 'pending',
        message: 'Complete authorization by opening the URL',
        connected_account_id: 'con_test_link',
        redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
        ...fields,
      },
      null,
      2
    );

  layer(testLayer())('[Given] composio link <toolkit> and a rejected account listing', it => {
    it.effect('[Then] the link is created as if the user had no account yet', () =>
      Effect.gen(function* () {
        const stub = withoutExistingAccounts();
        yield* cli(['link', 'gmail', '--no-wait']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines).toEqual([
          'Linking gmail...',
          ...redirect,
          pending({ toolkit: 'gmail', project_type: 'CONSUMER' }),
        ]);
        expect(stub.requests.map(request => request.path)).toEqual([
          `${LISTING}user_ids=consumer-user-org_test&toolkit_slugs=gmail&statuses=ACTIVE&limit=100`,
          `${LISTING}user_ids=consumer-user-org_test&statuses=ACTIVE&limit=1000`,
        ]);
      })
    );
  });

  layer(testLayer())('[Given] composio link --auth-config and a rejected account listing', it => {
    it.effect('[Then] the link is created as if the user had no account yet', () =>
      Effect.gen(function* () {
        const stub = withoutExistingAccounts();
        yield* cli([
          'dev',
          'connected-accounts',
          'link',
          '--auth-config',
          'ac_1',
          '--user-id',
          'user_1',
          '--no-wait',
        ]).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines).toEqual([
          'Creating link session...',
          ...redirect,
          pending({ project_type: 'DEVELOPER' }),
        ]);
        expect(stub.requests.map(request => request.path)).toEqual([
          `${LISTING}user_ids=user_1&auth_config_ids=ac_1&statuses=ACTIVE&limit=100`,
        ]);
      })
    );
  });
});
