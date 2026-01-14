import {
  pipe,
  Data,
  Effect,
  Option,
  Schema,
  Array,
  Order,
  ParseResult,
  String,
  Stream,
  Sink,
  SynchronizedRef,
} from 'effect';
import { Composio as _RawComposioClient, APIPromise } from '@composio/client';
import { Toolkit, Toolkits } from 'src/models/toolkits';
import { ToolsAsEnums, Tools, Tool } from 'src/models/tools';
import { Session, RetrievedSession } from 'src/models/session';
import { TriggerType, TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
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
 * Error thrown when one or more toolkit slugs are invalid.
 */
export class InvalidToolkitsError extends Data.TaggedError('services/InvalidToolkitsError')<{
  readonly invalidToolkits: ReadonlyArray<string>;
  readonly availableToolkits: ReadonlyArray<string>;
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

export const CliGetSessionResponse = RetrievedSession;
export type CliRetrieveSessionResponse = Schema.Schema.Type<typeof CliGetSessionResponse>;

export const ToolkitsResponse = Schema.Struct({
  items: Toolkits,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'ToolkitsResponse' });
export type ToolkitsResponse = Schema.Schema.Type<typeof ToolkitsResponse>;

export const ToolsAsEnumsResponse = ToolsAsEnums;
export type ToolsAsEnumsResponse = Schema.Schema.Type<typeof ToolsAsEnumsResponse>;

export const ToolsResponse = Schema.Struct({
  items: Tools,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'ToolsResponse' });
export type ToolsResponse = Schema.Schema.Type<typeof ToolsResponse>;

export const TriggerTypesAsEnumsResponse = TriggerTypesAsEnums;
export type TriggerTypesAsEnumsResponse = Schema.Schema.Type<typeof TriggerTypesAsEnumsResponse>;

export const TriggerTypesResponse = Schema.Struct({
  items: TriggerTypes,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'TriggerTypesResponse' });

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
 * Result of streaming a response with byte counting.
 */
interface StreamedResponse {
  /** The parsed JSON data from the response body */
  readonly json: unknown;
  /** The exact byte size of the response body */
  readonly byteSize: number;
}

type Metrics = {
  readonly byteSize: number;
  readonly requests: number;
};

/**
 * Streams a Fetch Response body, counting bytes precisely and parsing JSON in a single pass.
 * Uses streaming to avoid loading the entire response into memory at once.
 *
 * @param response - The Fetch API Response object
 * @returns An Effect that yields the parsed JSON data and byte count
 */
const streamResponseWithByteCount = (
  response: Response
): Effect.Effect<StreamedResponse, HttpServerError> =>
  Effect.gen(function* () {
    const body = response.body;
    if (!body) {
      return yield* Effect.fail(
        new HttpServerError({
          cause: 'Response body is null',
        })
      );
    }

    // Convert the ReadableStream to an Effect Stream
    const byteStream = Stream.fromReadableStream(
      () => body,
      (error: unknown) =>
        new HttpServerError({
          cause: error,
        })
    );

    // Collect all chunks while counting bytes
    const [chunks, byteSize] = yield* pipe(
      byteStream,
      Stream.run(
        Sink.fold<[Uint8Array[], number], Uint8Array>(
          [[], 0],
          () => true,
          ([chunks, size], chunk) => [[...chunks, chunk], size + chunk.byteLength]
        )
      )
    );

    // Merge chunks into a single Uint8Array
    const merged = new Uint8Array(byteSize);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Decode and parse JSON
    const text = new TextDecoder().decode(merged);
    const json = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: error =>
        new HttpServerError({
          cause: `Failed to parse JSON response: ${error}`,
        }),
    });

    return { json, byteSize };
  });

// Utility function for calling the Composio API and decoding its response.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callClient = <T, S extends Schema.Schema<any, any>>(
  clientSingleton: ComposioClientSingleton,
  apiCall: (client: _RawComposioClient) => APIPromise<T>,
  responseSchema: S
): Effect.Effect<
  { data: Schema.Schema.Type<S>; metrics: Metrics },
  HttpError | NoSuchElementException
> =>
  Effect.gen(function* () {
    const client = yield* clientSingleton.get();
    const response = yield* Effect.tryPromise({
      try: () => apiCall(client).asResponse(),
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

    // Stream the response body with byte counting
    const { json, byteSize } = yield* streamResponseWithByteCount(response);
    const metrics = { byteSize, requests: 1 };

    const typedJson = yield* pipe(
      Schema.decodeUnknown(responseSchema)(json),
      Effect.catchTag('ParseError', e => {
        const message = ParseResult.TreeFormatter.formatErrorSync(e);

        return new HttpDecodingError({
          cause: `ParseError\n   ${message}`,
        });
      })
    );

    return { metrics, data: typedJson };
  });

// Schema constraint for paginated responses
type PaginatedSchema = Schema.Schema<
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ReadonlyArray<any>;
    next_cursor: string | null;
    total_pages: number;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

// Utility function for calling paginated Composio API endpoints.
// Automatically fetches all pages until the specified limit is reached.
const callClientWithPagination = <T, S extends PaginatedSchema>(
  clientSingleton: ComposioClientSingleton,
  apiCall: (client: _RawComposioClient, cursor?: string) => APIPromise<T>,
  responseSchema: S,
  limit: number
): Effect.Effect<
  { data: Schema.Schema.Type<S>; metrics: Metrics },
  HttpError | NoSuchElementException
> =>
  Effect.gen(function* () {
    const client = yield* clientSingleton.get();
    let totalByteSize = 0;
    let totalRequests = 0;

    const fetchPage = (cursor?: string): Effect.Effect<StreamedResponse, HttpServerError> =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () => apiCall(client, cursor).asResponse(),
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

        // Stream the response body with byte counting
        return yield* streamResponseWithByteCount(response);
      });

    type DecodedPage = Schema.Schema.Type<S>;

    const decodeResponse = (json: unknown): Effect.Effect<DecodedPage, HttpDecodingError> =>
      pipe(
        Schema.decodeUnknown(responseSchema)(json),
        Effect.catchTag('ParseError', e => {
          const message = ParseResult.TreeFormatter.formatErrorSync(e);

          return new HttpDecodingError({
            cause: `ParseError\n   ${message}`,
          });
        })
      ) as Effect.Effect<DecodedPage, HttpDecodingError>;

    let allItems: ReadonlyArray<unknown> = [];
    let currentCursor: string | null = null;
    let totalPages = 0;

    while (allItems.length < limit) {
      const { json, byteSize } = yield* fetchPage(currentCursor ?? undefined);
      totalByteSize += byteSize;
      totalRequests += 1;

      const decoded: DecodedPage = yield* decodeResponse(json);

      allItems = allItems.concat(decoded.items);
      totalPages = decoded.total_pages;
      currentCursor = decoded.next_cursor;

      // Stop if no more pages
      if (currentCursor === null) {
        break;
      }
    }

    const metrics = { byteSize: totalByteSize, requests: totalRequests };

    return {
      data: {
        items: allItems.slice(0, limit),
        total_pages: totalPages,
        next_cursor: currentCursor,
      } as DecodedPage,
      metrics,
    };
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
          const baseURL = ctx.data.baseURL;

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

      // Initialize metrics tracking via SynchronizedRef
      const metricsRef = yield* SynchronizedRef.make<Metrics>({ byteSize: 0, requests: 0 });

      // Helper to update metrics and return just the data
      const withMetrics = <A, E, R>(
        effect: Effect.Effect<{ data: A; metrics: Metrics }, E, R>
      ): Effect.Effect<A, E, R> =>
        Effect.gen(function* () {
          const { data, metrics } = yield* effect;
          yield* SynchronizedRef.update(metricsRef, current => ({
            byteSize: current.byteSize + metrics.byteSize,
            requests: current.requests + metrics.requests,
          }));
          return data;
        });

      return {
        /**
         * Returns a snapshot of the current accumulated metrics (total bytes received and request count).
         */
        getMetrics: () => SynchronizedRef.get(metricsRef),
        toolkits: {
          /**
           * Retrieves a comprehensive list of toolkits that are available to the authenticated project.
           * If limit is provided, automatically handles pagination to fetch up to that many items.
           */
          list: (params?: { limit?: number }) =>
            params?.limit
              ? withMetrics(
                  callClientWithPagination(
                    clientSingleton,
                    (client, cursor) => client.toolkits.list({ cursor }),
                    ToolkitsResponse,
                    params.limit
                  )
                )
              : withMetrics(
                  callClient(clientSingleton, client => client.toolkits.list(), ToolkitsResponse)
                ),
        },
        tools: {
          /**
           * Retrieve a list of all available tool enumeration values (tool slugs) for the project.
           */
          retrieveEnum: () =>
            withMetrics(
              callClient(
                clientSingleton,
                client => client.tools.retrieveEnum(),
                ToolsAsEnumsResponse
              )
            ),
          /**
           * Retrieve a list of tools, automatically handling pagination to fetch up to $limit items.
           */
          list: (params: { limit: number }) =>
            withMetrics(
              callClientWithPagination(
                clientSingleton,
                (client, cursor) =>
                  client.tools.list({ cursor, limit: params.limit, toolkit_versions: 'latest' }),
                ToolsResponse,
                params.limit
              )
            ),
        },
        triggersTypes: {
          /**
           * Retrieves a list of all available trigger type enum values that can be used across the API.
           */
          retrieveEnum: () =>
            withMetrics(
              callClient(
                clientSingleton,
                client => client.triggersTypes.retrieveEnum(),
                TriggerTypesAsEnumsResponse
              )
            ),
          /**
           * Retrieve a list of trigger types, automatically handling pagination to fetch up to $limit items.
           */
          list: (params: { limit: number }) =>
            withMetrics(
              callClientWithPagination(
                clientSingleton,
                (client, cursor) => client.triggersTypes.list({ cursor, limit: params.limit }),
                TriggerTypesResponse,
                params.limit
              )
            ),
        },
        cli: {
          /**
           * Generates a new CLI session with a random 6-character code.
           */
          createSession: () =>
            withMetrics(
              callClient(
                clientSingleton,
                client => client.cli.createSession(),
                CliCreateSessionResponse
              )
            ),

          /**
           * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
           */
          getSession: (session: { id: string }) =>
            withMetrics(
              callClient(
                clientSingleton,
                client => client.cli.getSession(session),
                CliGetSessionResponse
              )
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

      const getToolkits = (limit?: number) =>
        client.toolkits.list({ limit }).pipe(
          Effect.map(response => response.items),
          Effect.flatMap(
            Effect.fn(function* (toolkits) {
              // Sort apps by slug.
              // TODO: make sure this happens on the server-side.
              const orderBySlug = Order.mapInput(Order.string, (app: Toolkit) => app.slug);
              return Array.sort(toolkits, orderBySlug) as ReadonlyArray<Toolkit>;
            })
          )
        );

      return {
        getToolkits,
        getMetrics: () => client.getMetrics(),
        getToolsAsEnums: () => client.tools.retrieveEnum(),
        getTools: (limit: number) =>
          client.tools.list({ limit }).pipe(
            Effect.map(response => response.items),
            Effect.flatMap(
              Effect.fn(function* (tools) {
                // Sort apps by slug.
                // TODO: make sure this happens on the server-side.
                const orderBySlug = Order.mapInput(Order.string, (app: Tool) => app.slug);
                return Array.sort(tools, orderBySlug) as ReadonlyArray<Tool>;
              })
            )
          ),
        getTriggerTypesAsEnums: () => client.triggersTypes.retrieveEnum(),
        getTriggerTypes: (limit: number) =>
          client.triggersTypes.list({ limit }).pipe(
            Effect.map(response => response.items),
            Effect.flatMap(
              Effect.fn(function* (triggerTypes) {
                // Sort apps by slug.
                // TODO: make sure this happens on the server-side.
                const orderBySlug = Order.mapInput(Order.string, (app: TriggerType) => app.slug);
                return Array.sort(triggerTypes, orderBySlug) as ReadonlyArray<TriggerType>;
              })
            )
          ),
        /**
         * Validates that the given toolkit slugs are valid by comparing them against the list
         * of available toolkits. Returns the list of valid toolkit slugs (normalized to lowercase).
         * @param toolkitSlugs - Array of toolkit slugs to validate (case-insensitive)
         */
        validateToolkits: (
          toolkitSlugs: ReadonlyArray<string>
        ): Effect.Effect<
          ReadonlyArray<string>,
          InvalidToolkitsError | HttpError | NoSuchElementException
        > =>
          Effect.gen(function* () {
            // Normalize input slugs to lowercase for comparison
            const normalizedInputSlugs = toolkitSlugs.map(slug => String.toLowerCase(slug));

            // Fetch all available toolkits
            const allToolkits = yield* getToolkits();
            const availableSlugs = allToolkits.map(toolkit => String.toLowerCase(toolkit.slug));

            // Find invalid slugs
            const invalidSlugs = normalizedInputSlugs.filter(
              slug => !availableSlugs.includes(slug)
            );

            if (invalidSlugs.length > 0) {
              return yield* Effect.fail(
                new InvalidToolkitsError({
                  invalidToolkits: invalidSlugs,
                  availableToolkits: availableSlugs,
                })
              );
            }

            return normalizedInputSlugs;
          }),
        /**
         * Filters the given list of toolkits to only include those with the specified slugs.
         * @param toolkits - Array of toolkits to filter
         * @param toolkitSlugs - Array of toolkit slugs to filter by (case-insensitive)
         */
        filterToolkitsBySlugs: (
          toolkits: ReadonlyArray<Toolkit>,
          toolkitSlugs: ReadonlyArray<string>
        ): ReadonlyArray<Toolkit> => {
          const normalizedSlugs = new Set(toolkitSlugs.map(slug => String.toLowerCase(slug)));
          return toolkits.filter(toolkit => normalizedSlugs.has(String.toLowerCase(toolkit.slug)));
        },
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
      };
    }),
    dependencies: [ComposioClientLive.Default],
  }
) {}
