import { describe, expect, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Effect, Exit } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

const page = {
  data: [
    {
      id: 'log_send_1',
      actionKey: 'GMAIL_SEND_EMAIL',
      appKey: 'gmail',
      app: { icon: 'https://logos.composio.dev/gmail', name: 'Gmail' },
      connectedAccountId: 'ca_gmail_1',
      entityId: 'user_1',
      status: 'success',
      executionTime: 412,
      minimalResponse: '{"id":"msg_1"}',
      createdAt: 1767225600000,
    },
    {
      id: 'log_fetch_2',
      actionKey: 'GMAIL_FETCH_EMAILS',
      appKey: 'gmail',
      app: { icon: 'https://logos.composio.dev/gmail', name: 'Gmail' },
      connectedAccountId: 'ca_gmail_1',
      entityId: 'user_1',
      status: 'failed',
      executionTime: 97,
      minimalResponse: '{"error":"quota"}',
      createdAt: 1767225660000,
    },
  ],
  nextCursor: null,
};

describe('CLI: composio dev logs tools over the API client', () => {
  layer(testLayer)('[Given] a page of tool logs', it => {
    it.effect('[Then] the logs are listed as a table and printed as the API returned them', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'tools', '--toolkit', 'gmail']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines).toEqual([
          'Fetching tool logs...',
          [
            'Listing 2 tool logs',
            '',
            'Created At               Log Id             Status   Toolkit      Tool                         Exec Time    Connected Account',
            '2026-01-01T00:00:00.000Z log_send_1         success  Gmail        GMAIL_SEND_EMAIL             412ms        ca_gmail_1',
            '2026-01-01T00:01:00.000Z log_fetch_2        failed   Gmail        GMAIL_FETCH_EMAILS           97ms         ca_gmail_1',
          ].join('\n'),
          'To view full details for a log:\n> composio dev logs tools "log_send_1"',
          JSON.stringify(page, null, 2),
        ]);
        expect(stub.requests).toEqual([
          {
            method: 'POST',
            path: '/api/v3.1/internal/action_execution/logs',
            body: {
              cursor: null,
              limit: 30,
              case_sensitive: false,
              search_params: [{ field: 'toolkit_key', operation: '==', value: 'gmail' }],
            },
          },
        ]);
      })
    );
  });

  layer(testLayer)('[Given] a comma-separated --user-id filter', it => {
    it.effect.each([
      {
        name: 'after the subcommand',
        args: ['dev', 'logs', 'tools', '--user-id', 'user_1,user_2'],
      },
      {
        name: 'before the subcommand',
        args: ['dev', '--user-id', 'user_1,user_2', 'logs', 'tools'],
      },
    ])('[Then] each user id is sent as a search param when passed $name', ({ args }) =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () => Response.json({ data: [] }));
        yield* cli(args).pipe(Effect.provide(stub.layer));

        expect(stub.requests).toMatchObject([
          {
            body: {
              search_params: [
                { field: 'user_id', operation: '==', value: 'user_1' },
                { field: 'user_id', operation: '==', value: 'user_2' },
              ],
            },
          },
        ]);
      })
    );
  });

  layer(testLayer)('[Given] the API rejects the request', it => {
    it.effect('[Then] the command fails with the status and response body as the cause', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () =>
          Response.json(
            { error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 } },
            { status: 403 }
          )
        );
        const exit = yield* cli(['dev', 'logs', 'tools']).pipe(
          Effect.provide(stub.layer),
          Effect.exit
        );
        const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

        expect(failure).toMatchObject({ _tag: 'commands/ToolLogsRequestError' });
        expect(extractErrorDetails(failure).message).toBe(
          'Failed to fetch tool logs.\nCaused by: 403 {"error":{"message":"Not allowed","code":1403,"slug":"Forbidden","status":403}}'
        );
      })
    );
  });

  layer(testLayer)('[Given] a page with a log in a shape the API contract does not allow', it => {
    it.effect('[Then] the log is listed with dashes for what it lacks', () =>
      Effect.gen(function* () {
        // A null status, a missing connected account, a missing execution
        // time, and no `nextCursor`: the response schema the client ships
        // allows none of that, while the table renders each as a dash.
        const driftedPage = {
          data: [
            {
              id: 'log_drift_1',
              actionKey: 'GMAIL_SEND_EMAIL',
              appKey: 'gmail',
              app: { icon: null, name: 'Gmail' },
              connectedAccountId: null,
              entityId: 'user_1',
              status: null,
              createdAt: 1767225600000,
            },
          ],
        };
        const stub = stubClientResources(['_internal'], () => Response.json(driftedPage));
        yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines[1]).toBe(
          [
            'Listing 1 tool log',
            '',
            'Created At               Log Id             Status   Toolkit      Tool                         Exec Time    Connected Account',
            '2026-01-01T00:00:00.000Z log_drift_1        -        Gmail        GMAIL_SEND_EMAIL             0ms          -',
          ].join('\n')
        );
        expect(lines.at(-1)).toBe(JSON.stringify(driftedPage, null, 2));
      })
    );
  });

  layer(testLayer)('[Given] one tool log in a shape the API contract does not allow', it => {
    it.effect('[Then] its details are shown and it is printed as the API returned it', () =>
      Effect.gen(function* () {
        const driftedLog = {
          id: 'log_drift_1',
          actionKey: 'GMAIL_SEND_EMAIL',
          appKey: 'gmail',
          app: { icon: null, name: 'Gmail' },
          connectedAccountId: null,
          entityId: 'user_1',
          status: null,
          createdAt: 1767225600000,
          payloadReceived: { recipient_email: 'a@b.c' },
          response: { id: 'msg_1' },
        };
        const stub = stubClientResources(['_internal'], () => Response.json(driftedLog));
        yield* cli(['dev', 'logs', 'tools', 'log_drift_1']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.join('\n')).toContain('GMAIL_SEND_EMAIL');
        expect(lines.at(-1)).toBe(JSON.stringify(driftedLog, null, 2));
        expect(stub.requests).toEqual([
          { method: 'GET', path: '/api/v3.1/internal/action_execution/log/log_drift_1' },
        ]);
      })
    );
  });
});
