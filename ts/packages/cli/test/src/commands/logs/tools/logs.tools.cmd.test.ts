import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';
import { log } from './logs.tools.fixtures';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

describe('CLI: composio dev logs tools', () => {
  layer(testLayer)(it => {
    it.effect(
      '[Given] every supported filter [Then] searches the public API with at most 100 results',
      () =>
        Effect.gen(function* () {
          const stub = stubClientResources(['logs'], () =>
            Response.json({ logs: [], next_cursor: null })
          );
          yield* cli([
            'dev',
            'logs',
            'tools',
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
          ]).pipe(Effect.provide(stub.layer));
          expect(stub.requests).toEqual([
            {
              method: 'POST',
              path: '/api/v3.1/logs/tool_execution',
              body: {
                cursor: '7',
                limit: 100,
                time_range: { from: 1, to: 2 },
                filters: [
                  { field: 'tool_slug', operator: '==', value: 'GMAIL_SEND_EMAIL' },
                  { field: 'toolkit_slug', operator: '==', value: 'gmail' },
                  { field: 'toolkit_slug', operator: '==', value: 'slack' },
                  { field: 'connected_account_id', operator: '==', value: 'ca_1' },
                  { field: 'auth_config_id', operator: '==', value: 'ac_1' },
                  { field: 'status', operator: '==', value: 'failed' },
                  { field: 'user_id', operator: '==', value: 'user_1' },
                  { field: 'log_id', operator: '==', value: 'log_a' },
                  { field: 'log_id', operator: '==', value: 'log_b' },
                  { field: 'session_id', operator: '==', value: 'trs_1' },
                ],
              },
            },
          ]);
        })
    );

    it.effect.each([
      { args: ['--limit', '0'], expected: { limit: 1 } },
      { args: ['--from', '10'], expected: { time_range: { from: 10, to: 1000 } } },
      { args: ['--to', '20'], expected: { time_range: { from: 0, to: 20 } } },
    ])('[Given] $args [Then] builds a bounded public request', ({ args, expected }) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(1000);
        const stub = stubClientResources(['logs'], () => Response.json({ logs: [] }));
        yield* cli(['dev', 'logs', 'tools', ...args]).pipe(Effect.provide(stub.layer));
        expect(stub.requests[0]?.body).toMatchObject(expected);
      })
    );

    it.effect.each([
      { args: ['dev', 'logs', 'tools', '--user-id', 'user_1,user_2'] },
      { args: ['dev', '--user-id', 'user_1,user_2', 'logs', 'tools'] },
    ])(
      '[Given] shared user filters at either position [Then] includes each user in the public filters',
      ({ args }) =>
        Effect.gen(function* () {
          const stub = stubClientResources(['logs'], () => Response.json({ logs: [] }));
          yield* cli(args).pipe(Effect.provide(stub.layer));
          expect(stub.requests[0]?.body).toMatchObject({
            filters: [
              { field: 'user_id', operator: '==', value: 'user_1' },
              { field: 'user_id', operator: '==', value: 'user_2' },
            ],
          });
        })
    );

    it.effect.each([
      { args: ['--case-sensitive'], option: '--case-sensitive' },
      { args: ['--session-id', 'cli_session'], option: '--session-id' },
      { args: ['--status', 'unknown'], option: '--status' },
    ])(
      '[Given] $args [Then] rejects unsupported filtering before requesting logs',
      ({ args, option }) =>
        Effect.gen(function* () {
          const stub = stubClientResources(['logs'], () => Response.json({ logs: [] }));
          const failure = yield* cli(['dev', 'logs', 'tools', ...args]).pipe(
            Effect.provide(stub.layer),
            Effect.flip
          );
          expect(failure).toMatchObject({ _tag: 'commands/CommandInputError', option });
          expect(stub.requests).toEqual([]);
        })
    );

    it.effect(
      '[Given] an empty public page [Then] warns on stderr and returns the page on stdout',
      () =>
        Effect.gen(function* () {
          const stdoutBefore = (yield* MockConsole.getLines({ stream: 'stdout' })).length;
          const page = { logs: [], next_cursor: null };
          const stub = stubClientResources(['logs'], () => Response.json(page));
          yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
          expect(
            (yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).join('\n')
          ).toContain('No tool logs found for the given filters.');
          expect((yield* MockConsole.getLines({ stream: 'stdout' })).slice(stdoutBefore)).toEqual([
            JSON.stringify(page, null, 2),
          ]);
          expect(stub.requests).toEqual([
            {
              method: 'POST',
              path: '/api/v3.1/logs/tool_execution',
              body: { cursor: null, limit: 30 },
            },
          ]);
        })
    );

    it.effect('[Given] a page cursor [Then] displays it and sends it back unchanged', () =>
      Effect.gen(function* () {
        const stdoutBefore = (yield* MockConsole.getLines({ stream: 'stdout' })).length;
        const page = { logs: [log], next_cursor: '1767225600000' };
        const stub = stubClientResources(['logs'], () => Response.json(page));
        yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        expect(stderr).toContain('Next cursor: 1767225600000');
        expect(stderr).toContain(
          'To view full details for a log:\n> composio dev logs tools "log_send_1"'
        );
        expect((yield* MockConsole.getLines({ stream: 'stdout' })).slice(stdoutBefore)).toEqual([
          JSON.stringify(page, null, 2),
        ]);
        yield* cli(['dev', 'logs', 'tools', '--cursor', page.next_cursor]).pipe(
          Effect.provide(stub.layer)
        );
        expect(stub.requests[1]?.body).toMatchObject({ cursor: page.next_cursor });
      })
    );
  });

  layer(TestLive())(it => {
    it.effect('[Given] no API key [Then] fails with NotLoggedInError', () =>
      Effect.gen(function* () {
        expect(yield* cli(['dev', 'logs', 'tools']).pipe(Effect.flip)).toMatchObject({
          _tag: 'commands/NotLoggedInError',
        });
      })
    );
  });
});
