import type { ServerResponse } from 'node:http';
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Fiber, Latch, Layer } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { TriggerRealtimeSubscriptionError, TriggersRealtime } from 'src/services/triggers-realtime';
import { makeShutdownController, ShutdownSignal } from 'src/services/shutdown-signal';
import { cli, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
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
  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] the realtime subscription fails',
    it => {
      it.effect('[Then] reports it on a redirected stderr and exits 1', () =>
        Effect.gen(function* () {
          yield* enableListen;
          const terminal = redirectedTerminalUI();
          const exit = yield* Effect.exit(
            cli(['dev', 'listen', '--max-events', '1']).pipe(
              Effect.provide(Layer.merge(failingRealtime, terminal.layer))
            )
          );

          expect(terminal.stderr()).toContain(
            'Could not subscribe to realtime trigger events: socket closed. Check your network connection or run `composio login`.\n'
          );
          expect(exitCodeOf(exit)).toBe(1);
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
      })
    );

    // No --max-events: only --fail-fast can stop this run.
    it.effect('[Then] --fail-fast stops at the first failed forward and exits 1', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        const exit = yield* Effect.exit(
          cli(['dev', 'listen', '--forward', 'http://127.0.0.1:9/composio', '--fail-fast']).pipe(
            Effect.provide(terminal.layer)
          )
        );

        expect(terminal.stderr()).toContain(
          '1 event failed to forward to http://127.0.0.1:9/composio while listening.'
        );
        expect(exitCodeOf(exit)).toBe(1);
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
      })
    );

    // Ctrl+C or SIGTERM once subscribed: the listener stops itself, sums up, and succeeds. The
    // forwarding failure logs its warn only after the failure was counted, so awaiting the latch
    // is an ordered count-is-set signal — no polling, no sleeps.
    it.effect.each(['SIGINT', 'SIGTERM'] as const)(
      '[When] %s arrives after the subscription [Then] it stops cleanly, sums up, and exits 0',
      signal =>
        Effect.gen(function* () {
          yield* enableListen;
          const shutdown = makeShutdownController();
          const forwardFailed = Latch.makeUnsafe(false);
          const terminal = redirectedTerminalUI({
            onWarn: message => {
              if (message.includes('Failed forwarding event to')) forwardFailed.openUnsafe();
            },
          });
          const fiber = yield* Effect.forkChild(
            cli(['dev', 'listen', '--forward', 'http://']).pipe(
              Effect.provide(terminal.layer),
              Effect.provideService(ShutdownSignal, shutdown.service)
            )
          );

          yield* forwardFailed.await;
          expect(shutdown.offer(signal)).toBe(true);
          const exit = yield* Fiber.await(fiber);

          expect(terminal.stderr()).toContain(
            '1 event failed to forward to http:// while listening.'
          );
          expect(exitCodeOf(exit)).toBe(0);
        })
    );

    // A signal the listener does not take (before the subscription, or SIGHUP): the runner
    // interrupts the listener fiber; the onExit finalizer must run the summary anyway.
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
        const exit = yield* Fiber.await(fiber);

        expect(terminal.stderr()).toContain(
          '1 event failed to forward to http:// while listening.'
        );
        // Recovered per-event failures, not a failed command: interrupted, so 130.
        expect(exitCodeOf(exit)).toBe(130);
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
        const exit = yield* withHttpServerEffect(
          (_req, res) => {
            requests += 1;
            if (requests === 1) res.end();
            else if (requests === 2) held.push(res);
            else setTimeout(() => res.writeHead(500).end(), 100);
          },
          url =>
            cli(['dev', 'listen', '--forward', url, '--max-events', '3', '--fail-fast']).pipe(
              Effect.provide(terminal.layer),
              Effect.ensuring(Effect.sync(() => held.forEach(res => res.end()))),
              Effect.exit
            )
        );

        expect(terminal.stderr()).toMatch(
          /1 event failed to forward to http:\/\/127\.0\.0\.1:\d+ while listening\./
        );
        expect(exitCodeOf(exit)).toBe(1);
      })
    );
  });
});
