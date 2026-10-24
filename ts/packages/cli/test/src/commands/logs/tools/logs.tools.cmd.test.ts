import { describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { buildToolLogShorthandSearchParams } from 'src/commands/logs/tools/logs.tools.handler';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

const log = {
  id: 'log_1',
  actionKey: 'GMAIL_SEND_EMAIL',
  appKey: 'gmail',
  app: { icon: 'https://logos.composio.dev/gmail', name: 'Gmail' },
  connectedAccountId: 'ca_gmail_1',
  entityId: 'user_1',
  status: 'success',
  executionTime: 412,
  minimalResponse: '{"id":"msg_1"}',
  createdAt: 1767225600000,
};

describe('buildToolLogShorthandSearchParams', () => {
  it('[Given] no filters [Then] returns empty search params', () => {
    expect(buildToolLogShorthandSearchParams({})).toEqual([]);
  });

  it('[Given] all supported filters [Then] maps each one to the expected backend key', () => {
    const output = buildToolLogShorthandSearchParams({
      tool: 'GMAIL_SEND_EMAIL',
      toolkit: 'gmail',
      connectedAccountId: 'ca_123',
      authConfigId: 'ac_123',
      status: 'success',
      userId: 'user_123',
      logId: 'log_123',
      toolRouterSessionId: 'trs_123',
      sessionId: 'sess_123',
    });

    expect(output).toEqual([
      { field: 'action_key', operation: '==', value: 'GMAIL_SEND_EMAIL' },
      { field: 'toolkit_key', operation: '==', value: 'gmail' },
      { field: 'connected_account_id', operation: '==', value: 'ca_123' },
      { field: 'auth_config_id', operation: '==', value: 'ac_123' },
      { field: 'execution_status', operation: '==', value: 'success' },
      { field: 'user_id', operation: '==', value: 'user_123' },
      { field: 'log_id', operation: '==', value: 'log_123' },
      { field: 'tool_router_session_id', operation: '==', value: 'trs_123' },
      { field: 'session_id', operation: '==', value: 'sess_123' },
    ]);
  });

  it('[Given] comma-separated filter values [Then] expands each value into separate search params', () => {
    const output = buildToolLogShorthandSearchParams({
      tool: 'GMAIL_SEND_EMAIL,SLACK_SEND_MESSAGE',
      toolkit: 'gmail,slack',
      status: 'success,failed',
      logId: 'log_1,log_2',
    });

    expect(output).toEqual([
      { field: 'action_key', operation: '==', value: 'GMAIL_SEND_EMAIL' },
      { field: 'action_key', operation: '==', value: 'SLACK_SEND_MESSAGE' },
      { field: 'toolkit_key', operation: '==', value: 'gmail' },
      { field: 'toolkit_key', operation: '==', value: 'slack' },
      { field: 'execution_status', operation: '==', value: 'success' },
      { field: 'execution_status', operation: '==', value: 'failed' },
      { field: 'log_id', operation: '==', value: 'log_1' },
      { field: 'log_id', operation: '==', value: 'log_2' },
    ]);
  });
});

describe('CLI: composio dev logs tools', () => {
  layer(testLayer)('[Given] no filters and no logs', it => {
    it.effect('[Then] it warns and prints the empty page as the API returned it', () =>
      Effect.gen(function* () {
        const page = { data: [], nextCursor: null };
        const stub = stubClientResources(['_internal'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });

        expect(stderr.join('\n')).toContain('No tool logs found for the given filters.');
        expect(stdout).toEqual([JSON.stringify(page, null, 2)]);
        expect(stub.requests).toMatchObject([
          { method: 'POST', body: { cursor: null, limit: 30, case_sensitive: false } },
        ]);
        expect(stub.requests[0]?.body).not.toHaveProperty('search_params');
      })
    );
  });

  layer(testLayer)('[Given] every filter flag', it => {
    it.effect(
      '[Then] each is sent as search params in a fixed order and the limit is clamped',
      () =>
        Effect.gen(function* () {
          const stub = stubClientResources(['_internal'], () => Response.json({ data: [] }));
          yield* cli([
            'dev',
            'logs',
            'tools',
            '--session-id',
            'sess_1',
            '--tool-router-session-id',
            'trs_1',
            '--log-id',
            'log_a,log_b',
            '--user-id',
            'user_1',
            '--status',
            'failed',
            '--auth-config-id',
            'ac_1',
            '--connected-account-id',
            'ca_1',
            '--toolkit',
            'gmail,slack',
            '--tool',
            'GMAIL_SEND_EMAIL',
            '--cursor',
            '7',
            '--from',
            '1',
            '--to',
            '2',
            '--limit',
            '5000',
            '--case-sensitive',
          ]).pipe(Effect.provide(stub.layer));

          expect(stub.requests).toEqual([
            {
              method: 'POST',
              path: '/api/v3.1/internal/action_execution/logs',
              body: {
                from: 1,
                to: 2,
                cursor: 7,
                limit: 1000,
                case_sensitive: true,
                search_params: [
                  { field: 'action_key', operation: '==', value: 'GMAIL_SEND_EMAIL' },
                  { field: 'toolkit_key', operation: '==', value: 'gmail' },
                  { field: 'toolkit_key', operation: '==', value: 'slack' },
                  { field: 'connected_account_id', operation: '==', value: 'ca_1' },
                  { field: 'auth_config_id', operation: '==', value: 'ac_1' },
                  { field: 'execution_status', operation: '==', value: 'failed' },
                  { field: 'user_id', operation: '==', value: 'user_1' },
                  { field: 'log_id', operation: '==', value: 'log_a' },
                  { field: 'log_id', operation: '==', value: 'log_b' },
                  { field: 'tool_router_session_id', operation: '==', value: 'trs_1' },
                  { field: 'session_id', operation: '==', value: 'sess_1' },
                ],
              },
            },
          ]);
        })
    );
  });

  layer(testLayer)('[Given] a page with a next cursor', it => {
    it.effect('[Then] it lists the logs, hints at the first one, and prints the cursor', () =>
      Effect.gen(function* () {
        const page = { data: [log], nextCursor: 42 };
        const stub = stubClientResources(['_internal'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });

        expect(stderr.join('\n')).toContain('Listing 1 tool log\n');
        expect(stderr).toContain(
          'To view full details for a log:\n> composio dev logs tools "log_1"'
        );
        expect(stderr).toContain('Next cursor: 42');
        expect(stdout).toEqual([JSON.stringify(page, null, 2)]);
      })
    );
  });

  layer(testLayer)('[Given] a log id argument', it => {
    it.effect('[Then] it fetches that log alone and prints it as the API returned it', () =>
      Effect.gen(function* () {
        const toolLog = { ...log, payloadReceived: { to: 'a@b.c' }, response: { id: 'msg_1' } };
        const stub = stubClientResources(['_internal'], () => Response.json(toolLog));
        yield* cli(['dev', 'logs', 'tools', 'log_1']).pipe(Effect.provide(stub.layer));
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });

        expect(stub.requests).toEqual([
          { method: 'GET', path: '/api/v3.1/internal/action_execution/log/log_1' },
        ]);
        expect(stderr.join('\n')).toContain('Payload:\n{\n  "to": "a@b.c"\n}');
        expect(stdout).toEqual([JSON.stringify(toolLog, null, 2)]);
      })
    );
  });

  layer(testLayer)('[Given] an empty log id argument', it => {
    it.effect('[Then] it lists logs instead of fetching one', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () => Response.json({ data: [] }));
        yield* cli(['dev', 'logs', 'tools', '']).pipe(Effect.provide(stub.layer));

        expect(stub.requests).toMatchObject([{ method: 'POST' }]);
      })
    );
  });

  layer(testLayer)('[Given] the API rejects the request for one log', it => {
    it.effect('[Then] the failure names the log id', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () =>
          Response.json(
            { error: { message: 'Not found', code: 1404, slug: 'Not_Found', status: 404 } },
            { status: 404 }
          )
        );
        const failure = yield* cli(['dev', 'logs', 'tools', 'log_missing']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({
          _tag: 'commands/ToolLogsRequestError',
          message: 'Failed to fetch tool log "log_missing".',
        });
      })
    );
  });

  layer(TestLive())('[Given] no API key', it => {
    it.effect('[Then] it fails with NotLoggedInError', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'logs', 'tools']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});
