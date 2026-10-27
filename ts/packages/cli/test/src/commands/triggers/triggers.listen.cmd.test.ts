import type { ServerResponse } from 'node:http';
import { afterEach } from 'vitest';
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Fiber, Latch, Layer } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { TriggerRealtimeSubscriptionError, TriggersRealtime } from 'src/services/triggers-realtime';
import { cli, TestLive } from 'test/__utils__';
import { withHttpServerEffect } from 'test/__utils__/http-server';
import { failingFileWrites } from 'test/__utils__/services/failing-file-writes';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const enableListen = Effect.gen(function* () {
  const config = yield* ComposioCliUserConfig;
  yield* config.update({
    experimentalFeatures: {
      ...config.raw.experimentalFeatures,
      listen: true,
    },
  });
});

const failingRealtime = Layer.succeed(
  TriggersRealtime,
  TriggersRealtime.of({
    listen: () => Effect.fail(new TriggerRealtimeSubscriptionError({ message: 'socket closed' })),
    listenInProject: () =>
      Effect.fail(new TriggerRealtimeSubscriptionError({ message: 'socket closed' })),
  })
);

describe('CLI: composio dev listen', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] the realtime subscription fails',
    it => {
      it.effect('[Then] reports it on a redirected stderr and exits 1', () =>
        Effect.gen(function* () {
          yield* enableListen;
          const terminal = redirectedTerminalUI();
          yield* cli(['dev', 'listen', '--max-events', '1']).pipe(
            Effect.provide(Layer.merge(failingRealtime, terminal.layer))
          );

          expect(terminal.stderr()).toContain(
            'Could not subscribe to realtime trigger events: socket closed. Check your network connection or run `composio login`.\n'
          );
          expect(process.exitCode).toBe(1);
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [
          {
            id: 'evt_conn_expired_1',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_1',
            },
          },
        ],
      },
    })
  )('[Given] a forwarding target that refuses events', it => {
    it.effect('[Then] sums the forwarding failures up on stderr when the listener stops', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        yield* cli([
          'dev',
          'listen',
          '--forward',
          'http://127.0.0.1:9/composio',
          '--max-events',
          '1',
        ]).pipe(Effect.provide(terminal.layer));

        expect(terminal.stderr()).toContain(
          '1 event failed to forward to http://127.0.0.1:9/composio while listening.'
        );
        // Recovered per-event failures, not a failed command.
        expect(process.exitCode).toBeUndefined();
      })
    );

    // No --max-events: only --fail-fast can stop this run.
    it.effect('[Then] --fail-fast stops at the first failed forward and exits 1', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        yield* cli([
          'dev',
          'listen',
          '--forward',
          'http://127.0.0.1:9/composio',
          '--fail-fast',
        ]).pipe(Effect.provide(terminal.layer));

        expect(terminal.stderr()).toContain(
          '1 event failed to forward to http://127.0.0.1:9/composio while listening.'
        );
        expect(process.exitCode).toBe(1);
      })
    );

    it.effect('[Then] sums the output-file failures up on stderr when the listener stops', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const outFile = '/tmp/composio-dev-listen-test-out.jsonl';
        const terminal = redirectedTerminalUI();
        yield* cli(['dev', 'listen', '--out', outFile, '--max-events', '1']).pipe(
          Effect.provide(
            Layer.merge(
              failingFileWrites(path => path === outFile),
              terminal.layer
            )
          )
        );

        expect(terminal.stderr()).toContain(
          `1 event failed to append to ${outFile} while listening.`
        );
        // Recovered per-event failures, not a failed command.
        expect(process.exitCode).toBeUndefined();
      })
    );

    // Ctrl+C/SIGTERM: runMain interrupts the listener fiber; the onExit finalizer must run the
    // summary anyway. The forwarding failure logs its warn only after the failure was counted,
    // so awaiting the latch is an ordered count-is-set signal — no polling, no sleeps.
    it.effect('[Then] sums the failures up even when the listener is interrupted mid-run', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const forwardFailed = Latch.makeUnsafe(false);
        const terminal = redirectedTerminalUI({
          onWarn: message => {
            if (message.includes('Failed forwarding event to')) forwardFailed.openUnsafe();
          },
        });
        const fiber = yield* Effect.forkChild(
          cli(['dev', 'listen', '--forward', 'http://']).pipe(Effect.provide(terminal.layer))
        );

        yield* forwardFailed.await;
        yield* Fiber.interrupt(fiber);

        expect(terminal.stderr()).toContain(
          '1 event failed to forward to http:// while listening.'
        );
        // Recovered per-event failures, not a failed command.
        expect(process.exitCode).toBeUndefined();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [
          {
            id: 'evt_conn_expired_1',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_1',
            },
          },
          {
            id: 'evt_conn_expired_2',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_2',
            },
          },
        ],
      },
    })
  )('[Given] --max-events is reached while another event is still forwarding', it => {
    // The target answers the second request at once and fails the first one shortly after, so
    // the listener reaches --max-events 2 while the first event is still in flight.
    it.effect('[Then] waits for that event and counts its failure', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        const held: Array<ServerResponse> = [];
        yield* withHttpServerEffect(
          (_req, res) => {
            const first = held.shift();
            if (first === undefined) {
              held.push(res);
              return;
            }
            res.end();
            setTimeout(() => first.writeHead(500).end(), 100);
          },
          url =>
            cli(['dev', 'listen', '--forward', url, '--max-events', '2']).pipe(
              Effect.provide(terminal.layer)
            )
        );

        expect(terminal.stderr()).toMatch(
          /1 event failed to forward to http:\/\/127\.0\.0\.1:\d+ while listening\./
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [
          {
            id: 'evt_conn_expired_1',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_1',
            },
          },
          {
            id: 'evt_conn_expired_2',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_2',
            },
          },
          {
            id: 'evt_conn_expired_3',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_3',
            },
          },
        ],
      },
    })
  )('[Given] --fail-fast and an event fails while --max-events waits for the others', it => {
    // The target answers the first request, holds the second open, and fails the third shortly
    // after, so the failure lands while the listener waits for the held event.
    it.effect('[Then] the failure ends the wait and exits 1', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        const held: Array<ServerResponse> = [];
        let requests = 0;
        yield* withHttpServerEffect(
          (_req, res) => {
            requests += 1;
            if (requests === 1) res.end();
            else if (requests === 2) held.push(res);
            else setTimeout(() => res.writeHead(500).end(), 100);
          },
          url =>
            cli(['dev', 'listen', '--forward', url, '--max-events', '3', '--fail-fast']).pipe(
              Effect.provide(terminal.layer),
              Effect.ensuring(Effect.sync(() => held.forEach(res => res.end())))
            )
        );

        expect(terminal.stderr()).toMatch(
          /1 event failed to forward to http:\/\/127\.0\.0\.1:\d+ while listening\./
        );
        expect(process.exitCode).toBe(1);
      })
    );
  });
});

const triggerMessage = (id: string, triggerSlug: string) => ({
  id,
  type: 'composio.trigger.message',
  timestamp: '2026-04-06T18:00:00.000Z',
  metadata: {
    trigger_slug: triggerSlug,
    trigger_id: `ti_${id}`,
    connected_account_id: 'ca_abc',
    auth_config_id: 'ac_abc',
    user_id: 'user-1',
  },
  data: {},
});

describe('CLI: composio dev triggers listen', () => {
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [
          triggerMessage('evt_gmail', 'GMAIL_NEW_GMAIL_MESSAGE'),
          triggerMessage('evt_one_drive', 'ONE_DRIVE_FILE_CREATED_TRIGGER'),
        ],
      },
    })
  )('[Given] --toolkits names a toolkit whose slug contains an underscore', it => {
    // #4947: the first `_` segment of `ONE_DRIVE_FILE_CREATED_TRIGGER` is `ONE`.
    it.effect('[Then] its events match and the others are dropped', () =>
      Effect.gen(function* () {
        const terminal = redirectedTerminalUI();
        yield* cli([
          'dev',
          'triggers',
          'listen',
          '--toolkits',
          'one_drive',
          '--max-events',
          '1',
        ]).pipe(Effect.provide(terminal.layer));

        expect(terminal.stdout()).toContain('"id":"evt_one_drive"');
        expect(terminal.stdout()).not.toContain('evt_gmail');
      })
    );
  });
});
