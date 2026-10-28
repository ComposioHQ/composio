import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Deferred, Effect, Exit, Fiber, Layer } from 'effect';
import * as tempy from 'tempy';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { TriggerRealtimeSubscriptionError, TriggersRealtime } from 'src/services/triggers-realtime';

// Exercise real user-context/config resolution without opening the OS credential store.
vi.mock('@composio/cli-keyring/effect', async importOriginal => {
  const actual = await importOriginal<typeof import('@composio/cli-keyring/effect')>();
  const { Effect, Layer } = await import('effect');
  const { KeyringError } = await import('@composio/cli-keyring');
  return {
    ...actual,
    KeyringLiveWithBackend: () =>
      Layer.succeed(actual.KeyringService, {
        getPassword: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        getSecret: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        setPassword: () => Effect.die(new Error('Unexpected credential write')),
        setSecret: () => Effect.die(new Error('Unexpected credential write')),
        deleteCredential: () => Effect.die(new Error('Unexpected credential deletion')),
        isAvailable: Effect.succeed(true),
      }),
  };
});

type ChannelAuthorizer = (
  params: { readonly channelName: string; readonly socketId: string },
  callback: (error: Error | null, data: unknown) => void
) => void;

interface ConstructedPusher {
  readonly key: string;
  readonly cluster: string;
  readonly authorize: ChannelAuthorizer;
}

// The realtime client, replaced by one that records how it was built and lets a test emit the
// channel's events. Each `listenInProject` builds one client, so `reset` starts a fresh record.
const pusher = vi.hoisted(() => {
  const state = {
    constructed: undefined as unknown as Promise<ConstructedPusher>,
    announce: (_value: ConstructedPusher) => undefined as void,
    handlers: new Map<string, (data?: unknown) => void>(),
    reset: () => {
      state.handlers = new Map();
      state.constructed = new Promise<ConstructedPusher>(resolve => {
        state.announce = resolve;
      });
    },
    emit: (event: string, data?: unknown) => state.handlers.get(event)?.(data),
  };
  state.reset();
  return state;
});

vi.mock('pusher-js', () => {
  class FakePusher {
    constructor(
      key: string,
      options: {
        readonly cluster: string;
        readonly channelAuthorization: { readonly customHandler: ChannelAuthorizer };
      }
    ) {
      pusher.announce({
        key,
        cluster: options.cluster,
        authorize: options.channelAuthorization.customHandler,
      });
    }
    subscribe() {
      return {
        bind: (event: string, handler: (data?: unknown) => void) => {
          pusher.handlers.set(event, handler);
        },
        unbind_all: () => undefined,
      };
    }
    unsubscribe() {}
    disconnect() {}
  }
  return { default: FakePusher };
});

const realtimeLayer = () =>
  TriggersRealtime.Default.pipe(
    Layer.provide(
      Layer.mergeAll(
        BunFileSystem.layer,
        BunPath.layer,
        Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempy.temporaryDirectory() })),
        Layer.succeed(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {
              COMPOSIO_USER_API_KEY: 'uak_realtime_test',
              COMPOSIO_BASE_URL: 'https://backend.composio.dev',
            },
          })
        )
      )
    )
  );

const realtimeResponses: Record<string, unknown> = {
  '/api/v3.1/cli/realtime/credentials': {
    pusher_key: 'pk_test',
    pusher_cluster: 'mt1',
    project_id: 'pr_nano',
  },
};

describe('TriggersRealtime.listenInProject', () => {
  beforeEach(() => {
    pusher.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Ctrl-C while the socket connects or the channel is authorized must still cancel the listener,
  // so the cooperative stop is registered only once Pusher confirms the subscription.
  it.live(
    '[Given] a pending subscription [Then] onSubscribed waits for Pusher to confirm it',
    () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
        Response.json(realtimeResponses[new URL(new Request(input).url).pathname])
      );

      return Effect.gen(function* () {
        const realtime = yield* TriggersRealtime;
        const onSubscribed = yield* Deferred.make<void>();
        const listening = yield* Effect.forkChild(
          realtime.listenInProject({ orgId: 'org_test', projectId: 'pr_test' }, () => undefined, {
            onSubscribed: Deferred.succeed(onSubscribed, undefined),
          })
        );
        yield* Effect.promise(() => pusher.constructed);
        yield* Effect.yieldNow;

        const beforeConfirmation = yield* Deferred.isDone(onSubscribed);
        pusher.emit('pusher:subscription_succeeded');
        yield* Deferred.await(onSubscribed);
        yield* Fiber.interrupt(listening);

        expect(beforeConfirmation).toBe(false);
      }).pipe(Effect.provide(realtimeLayer()));
    }
  );

  it.live('[Given] Pusher rejects the subscription [Then] the listener fails', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      Response.json(realtimeResponses[new URL(new Request(input).url).pathname])
    );

    return Effect.gen(function* () {
      const realtime = yield* TriggersRealtime;
      const listening = yield* Effect.forkChild(
        realtime.listenInProject({ orgId: 'org_test', projectId: 'pr_test' }, () => undefined, {
          onSubscribed: Effect.die(new Error('onSubscribed ran for a rejected subscription')),
        })
      );
      yield* Effect.promise(() => pusher.constructed);
      yield* Effect.yieldNow;

      pusher.emit('pusher:subscription_error', { type: 'AuthError', status: 403 });
      const exit = yield* Fiber.await(listening);

      expect(exit).toEqual(
        Exit.fail(
          new TriggerRealtimeSubscriptionError({
            message: 'Failed to subscribe to realtime trigger events',
            cause: { type: 'AuthError', status: 403 },
          })
        )
      );
    }).pipe(Effect.provide(realtimeLayer()));
  });

  it.live('authorizes the private channel when the realtime client asks for it', () => {
    const requests: Array<{ method: string; path: string; body: unknown }> = [];
    const responses: Record<string, unknown> = {
      '/api/v3.1/cli/realtime/credentials': {
        pusher_key: 'pk_test',
        pusher_cluster: 'mt1',
        project_id: 'pr_nano',
      },
      // `channel_data` only belongs to presence channels.
      '/api/v3.1/cli/realtime/auth': { auth: 'pk_test:signature', channel_data: '{"user_id":"1"}' },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const text = await request.text();
      requests.push({
        method: request.method,
        path,
        body: text === '' ? undefined : JSON.parse(text),
      });
      return Response.json(responses[path]);
    });

    return Effect.gen(function* () {
      const realtime = yield* TriggersRealtime;
      const listening = yield* Effect.forkChild(
        realtime.listenInProject({ orgId: 'org_test', projectId: 'pr_test' }, () => undefined)
      );

      const constructed = yield* Effect.promise(() => pusher.constructed);
      const authorized = yield* Effect.callback<unknown>(resume => {
        constructed.authorize(
          { channelName: 'private-cli-pr_nano', socketId: '123.456' },
          (error, data) => resume(Effect.succeed({ error, data }))
        );
      });
      yield* Fiber.interrupt(listening);

      expect(constructed).toMatchObject({ key: 'pk_test', cluster: 'mt1' });
      expect(authorized).toEqual({ error: null, data: { auth: 'pk_test:signature' } });
      expect(requests).toEqual([
        { method: 'GET', path: '/api/v3.1/cli/realtime/credentials', body: undefined },
        {
          method: 'POST',
          path: '/api/v3.1/cli/realtime/auth',
          body: { channel_name: 'private-cli-pr_nano', socket_id: '123.456' },
        },
      ]);
    }).pipe(Effect.provide(realtimeLayer()));
  });
});
