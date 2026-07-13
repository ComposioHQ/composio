import { Data, Effect, Runtime } from 'effect';
import { ChunkReassembler } from '@composio/core';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  type CliRealtimeAuthResponse,
  type CliRealtimeCredentialsResponse,
} from 'src/services/composio-clients';

type RawRealtimeEvent = Record<string, unknown>;

type PusherAuthOptions = {
  params?: {
    channel_name?: string;
    socket_id?: string;
    channelName?: string;
    socketId?: string;
  };
  channel_name?: string;
  socket_id?: string;
  channelName?: string;
  socketId?: string;
};

type PusherAuthCallback = (error: unknown, data?: unknown) => void;

type PusherChannel = {
  bind: (event: string, callback: (data: unknown) => void) => void;
  bind_global?: (callback: (eventName: string, data: unknown) => void) => void;
  unbind?: (event?: string, callback?: (data: unknown) => void) => void;
  unbind_all?: () => void;
};

type PusherClient = {
  subscribe: (channelName: string) => PusherChannel;
  unsubscribe: (channelName: string) => void;
  disconnect: () => void;
  connection?: {
    bind?: (event: string, callback: (data: unknown) => void) => void;
  };
};

type PusherCtor = new (
  key: string,
  options: {
    cluster: string;
    channelAuthorization: {
      customHandler: (
        authOptions: PusherAuthOptions,
        callback?: PusherAuthCallback
      ) => Promise<unknown> | void;
    };
  }
) => PusherClient;

export class TriggerRealtimeSubscriptionError extends Data.TaggedError(
  'services/TriggerRealtimeSubscriptionError'
)<{
  readonly cause?: unknown;
}> {}

/**
 * Service for listening to trigger events over Composio CLI realtime channels.
 * Uses:
 * - `cli.realtime.credentials` to fetch Pusher credentials + project nano id
 * - `cli.realtime.auth` for private channel auth callbacks
 */
export class TriggersRealtime extends Effect.Service<TriggersRealtime>()(
  'services/TriggersRealtime',
  {
    effect: Effect.gen(function* () {
      const sessionRepo = yield* ComposioSessionRepository;
      const clientSingleton = yield* ComposioClientSingleton;
      const runtime = yield* Effect.runtime<never>();

      const listenWith = (params: {
        getRealtimeCredentials: () => Effect.Effect<CliRealtimeCredentialsResponse>;
        authRealtimeChannel: (params: {
          channel_name: string;
          socket_id: string;
        }) => Effect.Effect<CliRealtimeAuthResponse>;
        onEvent: (data: RawRealtimeEvent) => void;
      }) =>
        Effect.acquireUseRelease(
          Effect.gen(function* () {
            const creds = yield* params.getRealtimeCredentials();
            const channelName = `private-cli-${creds.project_id}`;

            const pusherModule = yield* Effect.tryPromise({
              try: () => import('pusher-js'),
              catch: cause => new TriggerRealtimeSubscriptionError({ cause }),
            });

            const Pusher = pusherModule.default as unknown as PusherCtor;

            const pusher = new Pusher(creds.pusher_key, {
              cluster: creds.pusher_cluster,
              channelAuthorization: {
                customHandler: (authOptions: PusherAuthOptions, callback?: PusherAuthCallback) => {
                  const authParams = authOptions.params ?? authOptions;
                  const channel_name = authParams.channel_name ?? authParams.channelName;
                  const socket_id = authParams.socket_id ?? authParams.socketId;

                  const doAuth = async () => {
                    if (!channel_name || !socket_id) {
                      throw new Error('Missing channel_name or socket_id for realtime auth');
                    }

                    const response = await Runtime.runPromise(runtime)(
                      params.authRealtimeChannel({
                        channel_name,
                        socket_id,
                      })
                    );
                    // Pusher private channels verify signatures without channel_data.
                    // Some auth endpoints may still return channel_data, which can cause
                    // "Invalid signature" if included in the verification input.
                    const normalizedResponse = channel_name.startsWith('private-')
                      ? { auth: response.auth }
                      : response;
                    return normalizedResponse;
                  };

                  if (callback) {
                    void doAuth()
                      .then(data => callback(null, data))
                      .catch(error => callback(error));
                    return;
                  }

                  return doAuth();
                },
              },
            });

            const channel = pusher.subscribe(channelName);

            // Pusher has a 10 KB per-message limit.  When the Composio backend
            // produces a trigger payload that exceeds this, it splits the JSON
            // into numbered chunks sent as separate `chunked-trigger_to_client`
            // events.  We reassemble them here by accumulating chunks keyed by
            // event id, then joining once the final chunk arrives and every
            // intermediate index is present.
            //
            const reassembler = new ChunkReassembler();

            channel.bind('trigger_to_client', eventData => {
              params.onEvent((eventData ?? {}) as RawRealtimeEvent);
            });

            channel.bind('chunked-trigger_to_client', data => {
              const result = reassembler.add(data);
              if (result.status === 'complete') {
                try {
                  const parsed = JSON.parse(result.payload) as RawRealtimeEvent;
                  params.onEvent(parsed);
                } catch {
                  // Silently discard events that fail to parse after chunk reassembly
                }
              }
            });

            return {
              shutdown: async () => {
                reassembler.clear();
                channel.unbind_all?.();
                pusher.unsubscribe(channelName);
                pusher.disconnect();
              },
            };
          }),
          () => Effect.never,
          resource =>
            Effect.tryPromise({
              try: () => resource.shutdown(),
              catch: cause => new TriggerRealtimeSubscriptionError({ cause }),
            }).pipe(Effect.catchAll(() => Effect.void))
        );

      const listen = (onEvent: (data: RawRealtimeEvent) => void) =>
        listenWith({
          getRealtimeCredentials: () => sessionRepo.getRealtimeCredentials().pipe(Effect.orDie),
          authRealtimeChannel: params => sessionRepo.authRealtimeChannel(params).pipe(Effect.orDie),
          onEvent,
        });

      const listenInProject = (
        scope: { orgId: string; projectId: string },
        onEvent: (data: RawRealtimeEvent) => void
      ) =>
        Effect.gen(function* () {
          const client = yield* clientSingleton.getFor({
            orgId: scope.orgId,
            projectId: scope.projectId,
          });

          return yield* listenWith({
            getRealtimeCredentials: () =>
              Effect.tryPromise({
                try: () => client.cli.realtime.credentials(),
                catch: cause => new TriggerRealtimeSubscriptionError({ cause }),
              }).pipe(Effect.orDie),
            authRealtimeChannel: params =>
              Effect.tryPromise({
                try: () => client.cli.realtime.auth(params),
                catch: cause => new TriggerRealtimeSubscriptionError({ cause }),
              }).pipe(Effect.orDie),
            onEvent,
          });
        });

      return { listen, listenInProject };
    }),
    dependencies: [ComposioSessionRepository.Default, ComposioClientSingleton.Default],
  }
) {}
