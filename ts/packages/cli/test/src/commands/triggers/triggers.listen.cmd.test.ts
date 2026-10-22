import { afterEach } from 'vitest';
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { TriggerRealtimeSubscriptionError, TriggersRealtime } from 'src/services/triggers-realtime';
import { cli, TestLive } from 'test/__utils__';
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
  });
});
