import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

const log = {
  id: 'log_1',
  appName: 'gmail',
  status: 'success',
  createdAt: '2026-02-25T22:01:22.865Z',
  entityId: 'user_1',
  connectionId: 'conn_1',
  triggerId: 'trigger_1',
  triggerNanoId: 'ti_1',
  triggerName: 'GMAIL_NEW_GMAIL_MESSAGE',
};

describe('CLI: composio dev logs triggers', () => {
  layer(testLayer)('[Given] no filters and no logs', it => {
    it.effect('[Then] it warns and prints the empty page as the API returned it', () =>
      Effect.gen(function* () {
        const page = { data: [] };
        const stub = stubClientResources(['_internal'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'triggers']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.join('\n')).toContain('No trigger logs found for the given filters.');
        expect(lines.at(-1)).toBe(JSON.stringify(page, null, 2));
        expect(stub.requests).toMatchObject([
          { method: 'POST', body: { limit: 30, include_payload: false } },
        ]);
        expect(stub.requests[0]?.body).not.toHaveProperty('search_params');
      })
    );
  });

  layer(testLayer)('[Given] every filter flag', it => {
    it.effect('[Then] each is sent as search params in a fixed order and the limit is clamped', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () => Response.json({ data: [] }));
        yield* cli([
          'dev',
          'logs',
          'triggers',
          '--log-id',
          'log_a',
          '--connected-account-id',
          'ca_1,ca_2',
          '--user-id',
          'user_1',
          '--trigger-id',
          'ti_1',
          '--trigger',
          'GMAIL_NEW_GMAIL_MESSAGE,SLACK_NEW_MESSAGE',
          '--cursor',
          'cur_1',
          '--time',
          '1d',
          '--search',
          'inbox',
          '--from',
          '1',
          '--to',
          '2',
          '--limit',
          '5000',
          '--include-payload',
        ]).pipe(Effect.provide(stub.layer));

        expect(stub.requests).toMatchObject([
          {
            body: {
              cursor: 'cur_1',
              time: '1d',
              search: 'inbox',
              from: 1,
              to: 2,
              limit: 1000,
              include_payload: true,
              search_params: [
                { field: 'trigger_name', operation: '==', value: 'GMAIL_NEW_GMAIL_MESSAGE' },
                { field: 'trigger_name', operation: '==', value: 'SLACK_NEW_MESSAGE' },
                { field: 'trigger_id', operation: '==', value: 'ti_1' },
                { field: 'user_id', operation: '==', value: 'user_1' },
                { field: 'connected_account_id', operation: '==', value: 'ca_1' },
                { field: 'connected_account_id', operation: '==', value: 'ca_2' },
                { field: 'log_id', operation: '==', value: 'log_a' },
              ],
            },
          },
        ]);
      })
    );
  });

  layer(testLayer)('[Given] a page with a log id and a next cursor', it => {
    it.effect('[Then] it lists the logs, hints at the first one, and prints the cursor', () =>
      Effect.gen(function* () {
        const page = { data: [log], nextCursor: 'cur_2' };
        const stub = stubClientResources(['_internal'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'triggers']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Listing 1 trigger log\n');
        expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
        expect(output).toContain('composio dev logs triggers "log_1"');
        expect(output).toContain('Next cursor: cur_2');
        expect(lines.at(-1)).toBe(JSON.stringify(page, null, 2));
      })
    );
  });

  layer(testLayer)('[Given] a log id argument', it => {
    it.effect('[Then] it fetches that log alone and prints it as the API returned it', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () => Response.json(log));
        yield* cli(['dev', 'logs', 'triggers', 'log_1']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(stub.requests).toMatchObject([{ method: 'GET' }]);
        expect(stub.requests[0]?.path).toContain('log_1');
        expect(lines.join('\n')).toContain('Payload:');
        expect(lines.at(-1)).toBe(JSON.stringify(log, null, 2));
      })
    );
  });

  layer(testLayer)('[Given] an empty log id argument', it => {
    it.effect('[Then] it lists logs instead of fetching one', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () => Response.json({ data: [] }));
        yield* cli(['dev', 'logs', 'triggers', '']).pipe(Effect.provide(stub.layer));

        expect(stub.requests).toMatchObject([{ method: 'POST' }]);
      })
    );
  });

  layer(testLayer)('[Given] the API rejects the list request', it => {
    it.effect('[Then] the command fails with TriggerLogsRequestError', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['_internal'], () =>
          Response.json(
            { error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 } },
            { status: 403 }
          )
        );
        const failure = yield* cli(['dev', 'logs', 'triggers']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({
          _tag: 'commands/TriggerLogsRequestError',
          message: 'Failed to fetch trigger logs.',
        });
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
        const failure = yield* cli(['dev', 'logs', 'triggers', 'log_missing']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({
          _tag: 'commands/TriggerLogsRequestError',
          message: 'Failed to fetch trigger log "log_missing".',
        });
      })
    );
  });
});
