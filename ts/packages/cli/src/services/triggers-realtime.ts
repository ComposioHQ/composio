import { Data, Effect, Runtime } from 'effect';
import { ComposioSessionRepository } from 'src/services/composio-clients';

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

type ChunkedRealtimeEvent = {
  id: string;
  index: number;
  chunk: string;
  final: boolean;
};

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
      const runtime = yield* Effect.runtime<never>();

      const listen = (onEvent: (data: RawRealtimeEvent) => void) =>
        Effect.acquireUseRelease(
          Effect.gen(function* () {
            const creds = yield* sessionRepo.getRealtimeCredentials();
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
                  const params = authOptions.params ?? authOptions;
                  const channel_name = params.channel_name ?? params.channelName;
                  const socket_id = params.socket_id ?? params.socketId;

                  const doAuth = async () => {
                    if (!channel_name || !socket_id) {
                      throw new Error('Missing channel_name or socket_id for realtime auth');
                    }

                    const response = await Runtime.runPromise(runtime)(
                      sessionRepo.authRealtimeChannel({
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
            // Guard-rails:
            //  - Reject chunk indices outside [0, MAX_CHUNK_INDEX] to prevent a
            //    single malformed event from allocating a huge sparse array.
            //  - Evict incomplete entries older than CHUNK_TTL_MS so that lost
            //    chunks don't leak memory over long-running sessions.
            //  - Cap the total number of in-flight reassemblies to bound memory
            //    usage even under pathological input.
            const MAX_CHUNK_INDEX = 1_000;
            const CHUNK_TTL_MS = 60_000;
            const MAX_PENDING_CHUNKS = 100;

            type PendingChunkedEvent = {
              chunks: string[];
              receivedFinal: boolean;
              createdAt: number;
            };

            const chunkedEvents = new Map<string, PendingChunkedEvent>();

            // Periodic sweep: drop entries that have been sitting incomplete for
            // longer than CHUNK_TTL_MS.  Runs every CHUNK_TTL_MS and is cleared
            // on shutdown.
            const cleanupInterval = setInterval(() => {
              const now = Date.now();
              for (const [id, entry] of chunkedEvents) {
                if (now - entry.createdAt > CHUNK_TTL_MS) {
                  chunkedEvents.delete(id);
                }
              }
            }, CHUNK_TTL_MS);

            channel.bind('trigger_to_client', eventData => {
              onEvent((eventData ?? {}) as RawRealtimeEvent);
            });

            channel.bind('chunked-trigger_to_client', data => {
              const typed = data as ChunkedRealtimeEvent;
              if (!typed || typeof typed.id !== 'string' || typeof typed.index !== 'number') {
                return;
              }

              // Reject non-integer or out-of-range indices to prevent a single
              // malformed event from creating a massive sparse array.
              if (
                !Number.isInteger(typed.index) ||
                typed.index < 0 ||
                typed.index > MAX_CHUNK_INDEX
              ) {
                return;
              }

              if (!chunkedEvents.has(typed.id)) {
                // If we already have too many in-flight reassemblies, drop the
                // oldest one to make room.
                if (chunkedEvents.size >= MAX_PENDING_CHUNKS) {
                  const oldestId = chunkedEvents.keys().next().value;
                  if (oldestId !== undefined) chunkedEvents.delete(oldestId);
                }

                chunkedEvents.set(typed.id, {
                  chunks: [],
                  receivedFinal: false,
                  createdAt: Date.now(),
                });
              }

              const current = chunkedEvents.get(typed.id)!;
              current.chunks[typed.index] = typed.chunk;
              if (typed.final) {
                current.receivedFinal = true;
              }

              // Completeness check: for a dense array, .length equals the
              // number of defined keys.  For a sparse array (missing chunks),
              // .length is highestIndex + 1 but Object.keys only counts the
              // indices that were actually assigned, so the two diverge.
              if (
                current.receivedFinal &&
                current.chunks.length === Object.keys(current.chunks).length
              ) {
                try {
                  const parsed = JSON.parse(current.chunks.join('')) as RawRealtimeEvent;
                  onEvent(parsed);
                } catch {
                  // Silently discard events that fail to parse after chunk reassembly
                } finally {
                  chunkedEvents.delete(typed.id);
                }
              }
            });

            return {
              shutdown: async () => {
                clearInterval(cleanupInterval);
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

      return { listen };
    }),
    dependencies: [ComposioSessionRepository.Default],
  }
) {}
