import { afterEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Fiber, Layer } from 'effect';
import * as tempy from 'tempy';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { TriggersRealtime } from 'src/services/triggers-realtime';

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

// The realtime client, replaced by one that only records how it was built.
const pusher = vi.hoisted(() => {
  let announce: (constructed: ConstructedPusher) => void = () => undefined;
  const constructed = new Promise<ConstructedPusher>(resolve => {
    announce = resolve;
  });
  return { constructed, announce: (value: ConstructedPusher) => announce(value) };
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
      return { bind: () => undefined, unbind_all: () => undefined };
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

describe('TriggersRealtime.listenInProject', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
