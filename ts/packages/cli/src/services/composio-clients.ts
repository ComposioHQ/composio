import { pipe, Data, Effect, Option, Schema, Array, Order } from 'effect';
import type { ConfigError } from 'effect/ConfigError';
import { APP_CONFIG } from 'src/effects/app-config';
import { Composio as _RawComposioClient } from '@composio/client';
import { Toolkit, Toolkits } from 'src/models/toolkits';
import { Tools } from 'src/models/tools';
import { LinkedSession, Session, RetrievedSession } from 'src/models/session';
import { TriggerType } from 'src/models/trigger-types';

/**
 * Error types
 */

/**
 * Error thrown when a HTTP request fails.
 */
export class HttpServerError extends Data.TaggedError('services/HttpServerError')<{
  readonly cause: Error;
  readonly message: string;
}> {}

/**
 * Error thrown when a HTTP response doesn't match the expected response schema.
 */
export class HttpDecodingError extends Data.TaggedError('services/HttpDecodingError')<{
  readonly cause: Error;
  readonly message: string;
}> {}

export type HttpError = HttpServerError | HttpDecodingError;

/**
 * Response schemas
 */

export const CliCreateSessionResponse = Session;
export type CliCreateSessionResponse = Schema.Schema.Type<typeof CliCreateSessionResponse>;

export const CliLinkSessionResponse = LinkedSession;
export type CliLinkSessionResponse = Schema.Schema.Type<typeof CliLinkSessionResponse>;

export const CliRetrieveSessionResponse = RetrievedSession;
export type CliRetrieveSessionResponse = Schema.Schema.Type<typeof CliRetrieveSessionResponse>;

export const ToolkitsResponse = Schema.Struct({
  items: Toolkits,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.Int),
}).annotations({ identifier: 'ToolkitsResponse' });
export type ToolkitsResponse = Schema.Schema.Type<typeof ToolkitsResponse>;

export const ToolsResponse = Tools;
export type ToolsResponse = Schema.Schema.Type<typeof ToolsResponse>;

export const TriggerTypesResponse = Schema.Array(TriggerType);
export type TriggerResponse = Schema.Schema.Type<typeof TriggerTypesResponse>;

/**
 * Utilities
 */

// Utility function for calling the Composio API and decoding its response.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callClient = <T, S extends Schema.Schema<any, any>>(
  clientSingleton: ComposioClientSingleton,
  apiCall: (client: _RawComposioClient) => Promise<T>,
  responseSchema: S
): Effect.Effect<Schema.Schema.Type<S>, HttpError | ConfigError> =>
  Effect.gen(function* () {
    const client = yield* clientSingleton.get();
    const json = yield* Effect.tryPromise({
      try: () => apiCall(client),
      catch: error => {
        const e = error as Error;
        return new HttpServerError({
          cause: e,
          message: e.message,
        });
      },
    });

    return yield* pipe(
      Schema.decodeUnknown(responseSchema)(json),
      Effect.catchTag('ParseError', e => {
        return new HttpDecodingError({
          cause: e,
          message: e.message,
        });
      })
    );
  });

/**
 * Services
 */

/**
 * Singleton service that lazily accesses `Config` only when needed, which is used to build and provide
 * a raw (uneffectful, Promise-based) Composio client instance.
 */
class ComposioClientSingleton extends Effect.Service<ComposioClientSingleton>()(
  'services/ComposioClientSingleton',
  {
    accessors: true,
    sync: () => {
      let ref = Option.none<_RawComposioClient>();

      return {
        get: Effect.fn(function* () {
          if (Option.isSome(ref)) {
            return ref.value;
          }

          const apiKey = yield* APP_CONFIG['API_KEY'];
          const baseURLOpt = yield* APP_CONFIG['BASE_URL'];
          const baseURL = Option.getOrUndefined(baseURLOpt);

          yield* Effect.logDebug('Creating raw Composio client...');
          const client = new _RawComposioClient({ apiKey, baseURL });

          ref = Option.some(client);
          return client;
        }) satisfies () => Effect.Effect<_RawComposioClient, ConfigError, never>,
      };
    },
    dependencies: [],
  }
) {}

// Service that wraps the raw Composio client, which is shared by all client services.
class ComposioClientLive extends Effect.Service<ComposioClientLive>()(
  'services/ComposioClientLive',
  {
    effect: Effect.gen(function* () {
      const clientSingleton = yield* ComposioClientSingleton;

      return {
        toolkits: {
          /**
           * Retrieves a comprehensive list of toolkits that are available to the authenticated project.
           */
          list: () =>
            callClient(clientSingleton, client => client.toolkits.list(), ToolkitsResponse),
        },
        tools: {
          /**
           * Retrieve a list of all available tool enumeration values (tool slugs) for the project.
           */
          retrieveEnum: () =>
            callClient(clientSingleton, client => client.tools.retrieveEnum(), ToolsResponse),
        },
        triggersTypes: {
          /**
           * Retrieves a list of all available trigger type enum values that can be used across the API.
           */
          retrieveEnum: () =>
            callClient(
              clientSingleton,
              client => client.triggersTypes.retrieveEnum(),
              TriggerTypesResponse
            ),
        },
        v3: {
          cli: {
            /**
             * Generates a new CLI session with a random 6-character code.
             */
            createSession: () =>
              callClient(
                clientSingleton,
                client => client.v3.cli.createSession(),
                CliCreateSessionResponse
              ),

            /**
             * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
             */
            retrieveSession: (session: { id: string }) =>
              callClient(
                clientSingleton,
                client => client.v3.cli.retrieveSession(session),
                CliRetrieveSessionResponse
              ),

            /**
             * Links a pending CLI session to the currently authenticated user.
             */
            linkSession: (session: { id: string }) =>
              callClient(
                clientSingleton,
                client => client.v3.cli.linkSession(session),
                CliLinkSessionResponse
              ),
          },
        },
      };
    }),
    dependencies: [ComposioClientSingleton.Default],
  }
) {}

export class ComposioToolkitsRepository extends Effect.Service<ComposioToolkitsRepository>()(
  'services/ComposioToolkitsRepository',
  {
    effect: Effect.gen(function* () {
      const client = yield* ComposioClientLive;

      return {
        getToolkits: () =>
          // Effect.succeed([
          //   {
          //     slug: 'gmail',
          //     name: 'GMAIL',
          //   } as unknown as Toolkit,
          // ]),
          client.toolkits.list().pipe(
            Effect.map(response => response.items),
            Effect.flatMap(toolkits =>
              Effect.gen(function* () {
                // Sort apps by slug
                const orderBySlug = Order.mapInput(Order.string, (app: Toolkit) => app.slug);
                return Array.sort(toolkits, orderBySlug);
              })
            )
          ),
        getTools: () => client.tools.retrieveEnum(),
        getTriggerTypes: () => client.triggersTypes.retrieveEnum(),
      };
    }),
    dependencies: [ComposioClientLive.Default],
  }
) {}

export class ComposioSessionRepository extends Effect.Service<ComposioSessionRepository>()(
  'services/ComposioSessionRepository',
  {
    effect: Effect.gen(function* () {
      const client = yield* ComposioClientLive;

      return {
        createSession: () => client.v3.cli.createSession(),
        retrieveSession: (session: { id: string }) =>
          client.v3.cli.retrieveSession({ id: session.id }),
        linkSession: (session: { id: string }) => client.v3.cli.linkSession({ id: session.id }),
      };
    }),
    dependencies: [ComposioClientLive.Default],
  }
) {}
