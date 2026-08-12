import { Array as Arr, Data, Effect, Either, Option, Predicate, Runtime, Schema } from 'effect';
import { JsonRecordSchema } from 'src/effects/json';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  type CliRealtimeAuthResponse,
  type CliRealtimeCredentialsResponse,
} from 'src/services/composio-clients';

const RawRealtimeEvent = JsonRecordSchema;
type RawRealtimeEvent = typeof RawRealtimeEvent.Type;
const decodeRawRealtimeEvent = Schema.decodeUnknownOption(RawRealtimeEvent);

const ChunkedRealtimeEvent = Schema.Struct({
  id: Schema.String,
  index: Schema.Int,
  chunk: Schema.String,
  final: Schema.Boolean,
});
const decodeChunkedRealtimeEvent = Schema.decodeUnknownOption(ChunkedRealtimeEvent);

export class TriggerRealtimeSubscriptionError extends Data.TaggedError(
  'services/TriggerRealtimeSubscriptionError'
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const subscriptionError = (message: string) => (cause: unknown) =>
  new TriggerRealtimeSubscriptionError({ message, cause });

type PusherConstructor = (typeof import('pusher-js'))['default'];

const isPusherConstructor = (value: unknown): value is PusherConstructor =>
  Predicate.isFunction(value);

const propertyOf = (value: unknown, property: string): unknown =>
  Predicate.hasProperty(value, property) ? value[property] : undefined;

/**
 * Resolves the Pusher constructor across ESM/CJS interop shapes. pusher-js
 * ships CJS and has changed its export shape across versions: 8.4.x and 8.6.0
 * export the constructor itself (`module.exports = Pusher`), while 8.5.0's
 * Node bundle exports a namespace object (`module.exports = { Pusher }`) — an
 * undocumented upstream packaging regression (pusher/pusher-js#935, fixed by
 * pusher/pusher-js#936, first released in 8.6.0). With 8.5.0,
 * `module.default` stops being callable under both Node and Bun — from source
 * and in compiled binaries alike (issue #3918). The probes cover, in order: a
 * defensively double-wrapped default (`module.default.default`), the direct
 * class export (`module.default`, 8.4.0/8.6.0), a raw CJS module that is
 * itself the constructor, and the named `Pusher` export on either level
 * (`module.default.Pusher` is the 8.5.0 shape that crashed compiled release
 * binaries; runtimes also hoist it to `module.Pusher`).
 *
 * Exported for tests.
 */
export const resolvePusherConstructor = (
  pusherModule: unknown
): Option.Option<PusherConstructor> => {
  const moduleDefault = propertyOf(pusherModule, 'default');
  return Arr.findFirst(
    [
      propertyOf(moduleDefault, 'default'),
      moduleDefault,
      pusherModule,
      propertyOf(moduleDefault, 'Pusher'),
      propertyOf(pusherModule, 'Pusher'),
    ],
    isPusherConstructor
  );
};

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
        getRealtimeCredentials: () => Effect.Effect<
          CliRealtimeCredentialsResponse,
          TriggerRealtimeSubscriptionError
        >;
        authRealtimeChannel: (params: {
          channel_name: string;
          socket_id: string;
        }) => Effect.Effect<CliRealtimeAuthResponse, TriggerRealtimeSubscriptionError>;
        onEvent: (data: RawRealtimeEvent) => void;
      }) =>
        Effect.acquireUseRelease(
          Effect.gen(function* () {
            const creds = yield* params.getRealtimeCredentials();
            const channelName = `private-cli-${creds.project_id}`;

            const pusherModule = yield* Effect.tryPromise({
              try: () => import('pusher-js'),
              catch: subscriptionError('Failed to load the realtime client'),
            });

            const Pusher = yield* resolvePusherConstructor(pusherModule).pipe(
              Effect.mapError(
                subscriptionError('Realtime client module does not expose a constructor')
              )
            );

            const pusher = yield* Effect.try({
              try: () =>
                new Pusher(creds.pusher_key, {
                  cluster: creds.pusher_cluster,
                  channelAuthorization: {
                    customHandler: (authOptions, callback) => {
                      const channel_name = authOptions.channelName;
                      const socket_id = authOptions.socketId;

                      const doAuth = async () => {
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

                      void doAuth()
                        .then(data => callback(null, data))
                        .catch(cause =>
                          callback(cause instanceof Error ? cause : new Error(String(cause)), null)
                        );
                    },
                  },
                }),
              catch: subscriptionError('Failed to construct the realtime client'),
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

            channel.bind('trigger_to_client', (eventData: unknown) => {
              params.onEvent(Option.getOrElse(decodeRawRealtimeEvent(eventData), () => ({})));
            });

            channel.bind('chunked-trigger_to_client', (data: unknown) => {
              const decoded = decodeChunkedRealtimeEvent(data);
              if (Option.isNone(decoded)) {
                return;
              }
              const typed = decoded.value;

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

              const current = chunkedEvents.get(typed.id);
              if (!current) {
                return;
              }
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
                const reassembled = current.chunks.join('');
                chunkedEvents.delete(typed.id);
                // Silently discard events that fail to parse after chunk
                // reassembly; the buffer entry is already cleared either way.
                const parsed = Either.try((): unknown => JSON.parse(reassembled)).pipe(
                  Either.getRight,
                  Option.flatMap(decodeRawRealtimeEvent)
                );
                if (Option.isSome(parsed)) {
                  params.onEvent(parsed.value);
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
              catch: subscriptionError('Failed to shut down the realtime subscription'),
            }).pipe(Effect.catchAll(() => Effect.void))
        );

      const listen = (onEvent: (data: RawRealtimeEvent) => void) =>
        listenWith({
          getRealtimeCredentials: () =>
            sessionRepo
              .getRealtimeCredentials()
              .pipe(Effect.mapError(subscriptionError('Failed to fetch realtime credentials'))),
          authRealtimeChannel: params =>
            sessionRepo
              .authRealtimeChannel(params)
              .pipe(Effect.mapError(subscriptionError('Failed to authorize the realtime channel'))),
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
                catch: subscriptionError('Failed to fetch realtime credentials'),
              }),
            authRealtimeChannel: params =>
              Effect.tryPromise({
                try: () => client.cli.realtime.auth(params),
                catch: subscriptionError('Failed to authorize the realtime channel'),
              }),
            onEvent,
          });
        });

      return { listen, listenInProject };
    }),
    dependencies: [ComposioSessionRepository.Default, ComposioClientSingleton.Default],
  }
) {}
