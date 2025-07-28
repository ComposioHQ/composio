import { pipe, Data, Effect, Option, Schema, Array, Order, ParseResult } from 'effect';
import { Composio as _RawComposioClient } from '@composio/client';
import { Toolkit, Toolkits } from 'src/models/toolkits';
import { Tools } from 'src/models/tools';
import { LinkedSession, Session, RetrievedSession } from 'src/models/session';
import { TriggerTypes } from 'src/models/trigger-types';
import { ComposioUserContext, ComposioUserContextLive } from './user-context';
import type { NoSuchElementException } from 'effect/Cause';
import { renderPrettyError } from './utils/pretty-error';

/**
 * Error types
 */

/**
 * Error thrown when a HTTP request fails.
 */
export class HttpServerError extends Data.TaggedError('services/HttpServerError')<{
  readonly cause?: unknown;
}> {}

/**
 * Error thrown when a HTTP response doesn't match the expected response schema.
 */
export class HttpDecodingError extends Data.TaggedError('services/HttpDecodingError')<{
  readonly cause?: unknown;
}> {}

export type HttpError = HttpServerError | HttpDecodingError;

/**
 * Response schemas
 */

export const CliCreateSessionResponse = Session;
export type CliCreateSessionResponse = Schema.Schema.Type<typeof CliCreateSessionResponse>;

export const CliLinkSessionResponse = LinkedSession;
export type CliLinkSessionResponse = Schema.Schema.Type<typeof CliLinkSessionResponse>;

export const CliGetSessionResponse = RetrievedSession;
export type CliRetrieveSessionResponse = Schema.Schema.Type<typeof CliGetSessionResponse>;

export const ToolkitsResponse = Schema.Struct({
  items: Toolkits,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.Int),
}).annotations({ identifier: 'ToolkitsResponse' });
export type ToolkitsResponse = Schema.Schema.Type<typeof ToolkitsResponse>;

export const ToolsResponse = Tools;
export type ToolsResponse = Schema.Schema.Type<typeof ToolsResponse>;

export const TriggerTypesResponse = TriggerTypes;
export type TriggerResponse = Schema.Schema.Type<typeof TriggerTypesResponse>;

/**
 * Error response schemas
 */
export const HttpErrorResponse = Schema.Struct({
  status: Schema.Int,
  error: Schema.Struct({
    error: Schema.Struct({
      message: Schema.NonEmptyString,
      suggested_fix: Schema.String,
      code: Schema.Int,
    }),
  }),
}).annotations({ identifier: 'HttpErrorResponse' });
export type HttpErrorResponse = Schema.Schema.Type<typeof HttpErrorResponse>;

/**
 * Utilities
 */

// Utility function for calling the Composio API and decoding its response.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callClient = <T, S extends Schema.Schema<any, any>>(
  clientSingleton: ComposioClientSingleton,
  apiCall: (client: _RawComposioClient) => Promise<T>,
  responseSchema: S
): Effect.Effect<Schema.Schema.Type<S>, HttpError | NoSuchElementException> =>
  Effect.gen(function* () {
    const client = yield* clientSingleton.get();
    const json = yield* Effect.tryPromise({
      try: () => apiCall(client),
      catch: e => {
        const decodedOpt = Schema.decodeUnknownOption(HttpErrorResponse)(e);

        if (Option.isNone(decodedOpt)) {
          return new HttpServerError({
            cause: e,
          });
        }

        const {
          status,
          error: { error },
        } = decodedOpt.value;
        const pretty = renderPrettyError([
          ['code', error.code],
          ['message', error.message],
          ['suggested fix', error.suggested_fix],
        ]);

        return new HttpServerError({
          cause: `HTTP ${status}\n${pretty}`,
        });
      },
    });

    return yield* pipe(
      Schema.decodeUnknown(responseSchema)(json),
      Effect.catchTag('ParseError', e => {
        const message = ParseResult.TreeFormatter.formatErrorSync(e);

        return new HttpDecodingError({
          cause: `ParseError\n   ${message}`,
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
    effect: Effect.gen(function* () {
      const ctx = yield* ComposioUserContext;
      let ref = Option.none<_RawComposioClient>();

      return {
        get: Effect.fn(function* () {
          if (Option.isSome(ref)) {
            return ref.value;
          }

          // Note: `api_key` is not required in every API request.
          const apiKey = ctx.data.apiKey.pipe(Option.getOrUndefined);
          const baseURL = ctx.data.baseURL.pipe(Option.getOrUndefined);

          yield* Effect.logDebug('Creating raw Composio client...');
          const client = new _RawComposioClient({ apiKey, baseURL });

          ref = Option.some(client);
          return client;
        }) satisfies () => Effect.Effect<_RawComposioClient, NoSuchElementException, never>,
      };
    }),
    dependencies: [ComposioUserContextLive],
  }
) {}

// Service that wraps the raw Composio client, which is shared by all client services.
export class ComposioClientLive extends Effect.Service<ComposioClientLive>()(
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
        cli: {
          /**
           * Generates a new CLI session with a random 6-character code.
           */
          createSession: () =>
            callClient(
              clientSingleton,
              client => client.cli.createSession(),
              CliCreateSessionResponse
            ),

          /**
           * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
           */
          getSession: (session: { id: string }) =>
            callClient(
              clientSingleton,
              client => client.cli.getSession(session),
              CliGetSessionResponse
            ),

          /**
           * Links a pending CLI session to the currently authenticated user.
           */
          linkSession: (session: { id: string }) =>
            callClient(
              clientSingleton,
              client => client.cli.linkSession(session),
              CliLinkSessionResponse
            ),
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
        createSession: () => client.cli.createSession(),
        getSession: (session: { id: string }) => client.cli.getSession({ id: session.id }),
        linkSession: (session: { id: string }) => client.cli.linkSession({ id: session.id }),
      };
    }),
    dependencies: [ComposioClientLive.Default],
  }
) {}
