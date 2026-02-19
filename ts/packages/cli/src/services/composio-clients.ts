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
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import { Toolkit, Toolkits, ToolkitDetailed, type ToolkitSearchResult } from 'src/models/toolkits';
import { AuthConfigItem, AuthConfigItems } from 'src/models/auth-configs';
import { ConnectedAccountItem, ConnectedAccountItems } from 'src/models/connected-accounts';
import { ToolsAsEnums, Tools, Tool } from 'src/models/tools';
import {
  groupByVersion,
  type ToolkitVersionSpec,
  type ToolkitVersionOverrides,
} from 'src/effects/toolkit-version-overrides';
import { Session, RetrievedSession } from 'src/models/session';
import { TriggerType, TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import { ComposioUserContext, ComposioUserContextLive } from './user-context';
import type { NoSuchElementException } from 'effect/Cause';
import { renderPrettyError } from './utils/pretty-error';

/**
 * Error types
 */

/**
 * Structured error details from the Composio API.
 */
export interface HttpErrorDetails {
  readonly message: string;
  readonly suggestedFix: string;
  readonly code: number;
}

/**
 * Error thrown when a HTTP request fails.
 */
export class HttpServerError extends Data.TaggedError('services/HttpServerError')<{
  readonly cause?: unknown;
  readonly status?: number;
  readonly details?: HttpErrorDetails;
}> {}

/**
 * Error thrown when one or more toolkit slugs are invalid.
 */
export class InvalidToolkitsError extends Data.TaggedError('services/InvalidToolkitsError')<{
  readonly invalidToolkits: ReadonlyArray<string>;
  readonly availableToolkits: ReadonlyArray<string>;
}> {}

/**
 * Details about a single invalid version override.
 */
export interface InvalidVersionDetail {
  readonly toolkit: string;
  readonly requestedVersion: string;
  readonly availableVersions: ReadonlyArray<string>;
}

/**
 * Error thrown when one or more toolkit version overrides are invalid.
 */
export class InvalidToolkitVersionsError extends Data.TaggedError(
  'services/InvalidToolkitVersionsError'
)<{
  readonly invalidVersions: ReadonlyArray<InvalidVersionDetail>;
}> {}

/**
 * Error thrown when a HTTP response doesn't match the expected response schema.
 */
export class HttpDecodingError extends Data.TaggedError('services/HttpDecodingError')<{
  readonly cause?: unknown;
}> {}

export type HttpError = HttpServerError | HttpDecodingError;

const validateToolkitVersionsImpl = (
  client: {
    toolkits: {
      retrieve: (slug: string) => Effect.Effect<Toolkit, HttpError | NoSuchElementException, never>;
    };
  },
  overrides: ToolkitVersionOverrides,
  relevantToolkits?: ReadonlyArray<string>
): Effect.Effect<
  {
    validatedOverrides: ToolkitVersionOverrides;
    warnings: ReadonlyArray<string>;
  },
  InvalidToolkitVersionsError | InvalidToolkitsError | HttpError | NoSuchElementException
> =>
  Effect.gen(function* () {
    const determineOverridesToValidate = (
      overrides: ToolkitVersionOverrides,
      relevantToolkits?: ReadonlyArray<string>
    ): {
      overridesToValidate: Array<[toolkit: string, requestedVersion: string]>;
      warnings: Array<string>;
    } => {
      const warnings: string[] = [];
      const overridesToValidate: Array<[toolkit: string, requestedVersion: string]> = [];

      if (relevantToolkits) {
        const relevantSet = new Set(relevantToolkits.map(s => String.toLowerCase(s)));

        for (const [toolkit, version] of overrides) {
          if (relevantSet.has(toolkit)) {
            overridesToValidate.push([toolkit, version]);
          } else {
            warnings.push(
              `Version override for "${toolkit}" will be ignored (toolkit not in --toolkits filter)`
            );
          }
        }
      } else {
        overridesToValidate.push(...overrides.entries());
      }

      return { overridesToValidate, warnings };
    };

    const fetchToolkitVersionValidationResults = (
      overridesToValidate: ReadonlyArray<[toolkit: string, requestedVersion: string]>
    ): Effect.Effect<
      ReadonlyArray<{
        toolkit: string;
        requestedVersion: string;
        availableVersions: ReadonlyArray<string>;
        isValid: boolean;
      }>,
      InvalidToolkitsError | HttpError | NoSuchElementException
    > =>
      Effect.all(
        overridesToValidate.map(([toolkit, requestedVersion]) =>
          client.toolkits.retrieve(toolkit).pipe(
            Effect.map(toolkitData => ({
              toolkit,
              requestedVersion,
              availableVersions: toolkitData.meta.available_versions,
              isValid: toolkitData.meta.available_versions.includes(requestedVersion),
            })),
            Effect.catchTag('services/HttpServerError', e =>
              Effect.if(e.status === 404, {
                onTrue: () =>
                  Effect.fail(
                    new InvalidToolkitsError({
                      invalidToolkits: [toolkit],
                      availableToolkits: [],
                    })
                  ),
                onFalse: () => Effect.fail(e),
              })
            )
          )
        ),
        { concurrency: MAX_CONCURRENT_REQUESTS_PER_ENDPOINT }
      );

    const collectInvalidVersions = (
      validationResults: ReadonlyArray<{
        toolkit: string;
        requestedVersion: string;
        availableVersions: ReadonlyArray<string>;
        isValid: boolean;
      }>
    ): ReadonlyArray<InvalidVersionDetail> =>
      validationResults
        .filter(result => !result.isValid)
        .map(result => ({
          toolkit: result.toolkit,
          requestedVersion: result.requestedVersion,
          availableVersions: result.availableVersions,
        }));

    if (overrides.size === 0) {
      return { validatedOverrides: overrides, warnings: [] as ReadonlyArray<string> };
    }

    const { overridesToValidate, warnings } = determineOverridesToValidate(
      overrides,
      relevantToolkits
    );

    if (overridesToValidate.length === 0) {
      return {
        validatedOverrides: new Map() as ToolkitVersionOverrides,
        warnings: warnings as ReadonlyArray<string>,
      };
    }

    const validationResults = yield* fetchToolkitVersionValidationResults(overridesToValidate);
    const invalidVersions = collectInvalidVersions(validationResults);

    if (invalidVersions.length > 0) {
      return yield* Effect.fail(new InvalidToolkitVersionsError({ invalidVersions }));
    }

    const validatedOverrides = new Map(overridesToValidate) as ToolkitVersionOverrides;
    return { validatedOverrides, warnings: warnings as ReadonlyArray<string> };
  });

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

// Similar to Toolkits, without auth_schemes, with auth_config_details instead
export const ToolkitRetrieveResponse = Schema.Struct({
  name: Schema.String,
  slug: Schema.Trim.pipe(Schema.nonEmptyString()),
  is_local_toolkit: Schema.Boolean,
  composio_managed_auth_schemes: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  no_auth: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  meta: Schema.Struct({
    description: Schema.optionalWith(Schema.String, { default: () => '' }),
    categories: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
    created_at: Schema.DateTimeUtc,
    updated_at: Schema.DateTimeUtc,
    available_versions: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
    tools_count: Schema.optionalWith(Schema.Int, { default: () => 0 }),
    triggers_count: Schema.optionalWith(Schema.Int, { default: () => 0 }),
  }),
}).annotations({ identifier: 'ToolkitRetrieveResponse' });
export type ToolkitRetrieveResponse = Schema.Schema.Type<typeof ToolkitRetrieveResponse>;

export const ToolsAsEnumsResponse = ToolsAsEnums;
export type ToolsAsEnumsResponse = Schema.Schema.Type<typeof ToolsAsEnumsResponse>;

export const ToolsResponse = Schema.Struct({
  items: Tools,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'ToolsResponse' });
export type ToolsResponse = Schema.Schema.Type<typeof ToolsResponse>;

export const ToolDetailedResponse = Schema.Struct({
  name: Schema.String,
  slug: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  available_versions: Schema.Array(Schema.String),
  input_parameters: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  output_parameters: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  no_auth: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  toolkit: Schema.optionalWith(
    Schema.Struct({
      name: Schema.String,
      slug: Schema.String,
    }),
    { default: () => ({ name: '', slug: '' }) }
  ),
}).annotations({ identifier: 'ToolDetailedResponse' });
export type ToolDetailedResponse = Schema.Schema.Type<typeof ToolDetailedResponse>;

export const TriggerTypesAsEnumsResponse = TriggerTypesAsEnums;
export type TriggerTypesAsEnumsResponse = Schema.Schema.Type<typeof TriggerTypesAsEnumsResponse>;

export const TriggerTypesResponse = Schema.Struct({
  items: TriggerTypes,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'TriggerTypesResponse' });

// Single-page search response (includes total_items for "Listing X of Y" display)
export const ToolkitSearchResponse = Schema.Struct({
  items: Toolkits,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  current_page: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'ToolkitSearchResponse' });

// Detailed retrieve response (includes auth_config_details)
export const ToolkitDetailedResponse = ToolkitDetailed.annotations({
  identifier: 'ToolkitDetailedResponse',
});

// Auth config list response (single page with total_items for "Listing X of Y" display)
export const AuthConfigListResponse = Schema.Struct({
  items: AuthConfigItems,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  current_page: Schema.Int,
  next_cursor: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
}).annotations({ identifier: 'AuthConfigListResponse' });
export type AuthConfigListResponse = Schema.Schema.Type<typeof AuthConfigListResponse>;

// Auth config retrieve response (same shape as a single list item)
export const AuthConfigRetrieveResponse = AuthConfigItem.annotations({
  identifier: 'AuthConfigRetrieveResponse',
});
export type AuthConfigRetrieveResponse = Schema.Schema.Type<typeof AuthConfigRetrieveResponse>;

// Auth config create response
export const AuthConfigCreateResponse = Schema.Struct({
  auth_config: Schema.Struct({
    id: Schema.String,
    auth_scheme: Schema.String,
    is_composio_managed: Schema.Boolean,
  }),
  toolkit: Schema.Struct({
    slug: Schema.String,
  }),
}).annotations({ identifier: 'AuthConfigCreateResponse' });
export type AuthConfigCreateResponse = Schema.Schema.Type<typeof AuthConfigCreateResponse>;

// Connected account list response (single page with total_items for "Listing X of Y" display)
export const ConnectedAccountListResponse = Schema.Struct({
  items: ConnectedAccountItems,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  current_page: Schema.Int,
  next_cursor: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
}).annotations({ identifier: 'ConnectedAccountListResponse' });
export type ConnectedAccountListResponse = Schema.Schema.Type<typeof ConnectedAccountListResponse>;

// Connected account retrieve response (same shape as a single list item)
export const ConnectedAccountRetrieveResponse = ConnectedAccountItem.annotations({
  identifier: 'ConnectedAccountRetrieveResponse',
});

// Link create response
export const LinkCreateResponse = Schema.Struct({
  connected_account_id: Schema.String,
  expires_at: Schema.String,
  link_token: Schema.String,
  redirect_url: Schema.String,
}).annotations({ identifier: 'LinkCreateResponse' });
export type LinkCreateResponse = Schema.Schema.Type<typeof LinkCreateResponse>;
export type ConnectedAccountRetrieveResponse = Schema.Schema.Type<
  typeof ConnectedAccountRetrieveResponse
>;

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
 * Handles HTTP error responses by reading the body and formatting a proper error message.
 * Attempts to decode the response as HttpErrorResponse for structured errors,
 * otherwise falls back to a generic error with status code.
 *
 * @param response - The Fetch API Response object with a non-OK status
 * @returns An Effect that always fails with HttpServerError containing formatted error details
 */
const handleHttpErrorResponse = (response: Response): Effect.Effect<never, HttpServerError> =>
  Effect.gen(function* () {
    const status = response.status;
    const statusText = response.statusText;

    // Try to read the error body as JSON
    const errorBodyOpt = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => new HttpServerError({ cause: 'Failed to parse error response body' }),
    }).pipe(Effect.option);

    // Try to decode as structured error response
    if (Option.isSome(errorBodyOpt)) {
      const decodedOpt = Schema.decodeUnknownOption(HttpErrorResponse)(errorBodyOpt.value);

      if (Option.isSome(decodedOpt)) {
        const {
          error: { error },
        } = decodedOpt.value;
        const pretty = renderPrettyError([
          ['code', error.code],
          ['message', error.message],
          ['suggested fix', error.suggested_fix],
        ]);

        return yield* Effect.fail(
          new HttpServerError({
            cause: `HTTP ${status}\n${pretty}`,
            status,
            details: {
              message: error.message,
              suggestedFix: error.suggested_fix,
              code: error.code,
            },
          })
        );
      }
    }

    // Fallback to generic error message
    return yield* Effect.fail(
      new HttpServerError({
        cause: `HTTP ${status} ${statusText}`,
        status,
      })
    );
  });

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

    // Collect all chunks while counting bytes (mutate array in-place for O(N) instead of O(N^2))
    const [chunks, byteSize] = yield* pipe(
      byteStream,
      Stream.run(
        Sink.fold<[Uint8Array[], number], Uint8Array>(
          [[], 0],
          () => true,
          ([chunks, size], chunk) => {
            chunks.push(chunk);
            return [chunks, size + chunk.byteLength] as [Uint8Array[], number];
          }
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
      catch: e =>
        new HttpServerError({
          cause: e,
        }),
    });

    // Check HTTP status before streaming - .asResponse() doesn't throw on HTTP errors
    if (!response.ok) {
      return yield* handleHttpErrorResponse(response);
    }

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

// Maximum items per page allowed by the server
const MAX_PAGE_SIZE = 1000;

// Maximum concurrent requests per each endpoint
const MAX_CONCURRENT_REQUESTS_PER_ENDPOINT = 4;

// Utility function for calling paginated Composio API endpoints.
// Automatically fetches all pages, using MAX_PAGE_SIZE per request.
const callClientWithPagination = <T, S extends PaginatedSchema>(
  clientSingleton: ComposioClientSingleton,
  apiCall: (client: _RawComposioClient, cursor?: string, limit?: number) => APIPromise<T>,
  responseSchema: S
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
          try: () => apiCall(client, cursor, MAX_PAGE_SIZE).asResponse(),
          catch: e =>
            new HttpServerError({
              cause: e,
            }),
        });

        // Check HTTP status before streaming - .asResponse() doesn't throw on HTTP errors
        if (!response.ok) {
          return yield* handleHttpErrorResponse(response);
        }

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

    // Fetch all pages using MAX_PAGE_SIZE per request
    while (true) {
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
        items: allItems,
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

/**
 * Build the `tools` namespace for ComposioClientLive.
 * Extracted to keep the main generator under the max-lines-per-function limit.
 */
function buildToolsNamespace(
  clientSingleton: ComposioClientSingleton,
  withMetrics: <A, E, R>(
    effect: Effect.Effect<{ data: A; metrics: Metrics }, E, R>
  ) => Effect.Effect<A, E, R>
) {
  return {
    /**
     * Retrieve a list of all available tool enumeration values (tool slugs) for the project.
     */
    retrieveEnum: () =>
      withMetrics(
        callClient(clientSingleton, client => client.tools.retrieveEnum(), ToolsAsEnumsResponse)
      ),
    /**
     * Retrieve a list of tools, automatically handling pagination.
     * It always fetches the latest version of tools for each toolkit.
     * For more granular toolkit version control, use `listByVersionSpecs`.
     * @param toolkitSlugs - Array of toolkit slugs to filter by
     */
    list: (toolkitSlugs: ReadonlyArray<string>) =>
      withMetrics(
        callClientWithPagination(
          clientSingleton,
          (client, cursor, limit) =>
            client.tools.list({
              cursor,
              toolkit_slug: toolkitSlugs.length > 0 ? toolkitSlugs.join(',') : undefined,
              toolkit_versions: 'latest',
              limit,
            }),
          ToolsResponse
        )
      ),
    /**
     * Retrieve tools for multiple toolkits, grouped by version.
     * Makes parallel API calls for each version group, then merges results.
     * @param specs - Array of toolkit version specifications
     */
    listByVersionSpecs: (specs: ReadonlyArray<ToolkitVersionSpec>) =>
      Effect.gen(function* () {
        const grouped = groupByVersion(specs);
        const versionGroups = [...grouped.entries()];

        // Fetch all version groups in parallel with bounded concurrency
        const responses = yield* Effect.all(
          versionGroups.map(([version, slugs]) =>
            withMetrics(
              callClientWithPagination(
                clientSingleton,
                (client, cursor, limit) =>
                  client.tools.list({
                    cursor,
                    toolkit_slug: slugs.join(','),
                    toolkit_versions: version,
                    limit,
                  }),
                ToolsResponse
              )
            )
          ),
          { concurrency: MAX_CONCURRENT_REQUESTS_PER_ENDPOINT }
        );

        // Merge all tools from all version groups
        const allTools = responses.flatMap(response => response.items);
        return { items: allTools };
      }),
    /**
     * Search tools with optional filters. Returns a single page of results (no auto-pagination).
     * @param params - Search/filter parameters
     */
    search: (params: {
      search?: string;
      toolkit_slug?: string;
      tags?: string;
      limit?: number;
      cursor?: string;
    }) =>
      withMetrics(
        callClient(
          clientSingleton,
          client =>
            client.tools.list({
              search: params.search,
              toolkit_slug: params.toolkit_slug,
              tags: params.tags ? params.tags.split(',').map(t => t.trim()) : undefined,
              limit: params.limit,
              cursor: params.cursor,
              toolkit_versions: 'latest',
            }),
          ToolsResponse
        )
      ),
    /**
     * Retrieves detailed info about a single tool by slug.
     * @param slug - Tool slug (e.g. "GMAIL_SEND_EMAIL")
     */
    retrieve: (slug: string) =>
      withMetrics(
        callClient(
          clientSingleton,
          client => client.tools.retrieve(slug, { toolkit_versions: 'latest' }),
          ToolDetailedResponse
        )
      ),
  };
}

/**
 * Build the `authConfigs` namespace for ComposioClientLive.
 * Extracted to keep the main generator under the max-lines-per-function limit.
 */
function buildAuthConfigsNamespace(
  clientSingleton: ComposioClientSingleton,
  withMetrics: <A, E, R>(
    effect: Effect.Effect<{ data: A; metrics: Metrics }, E, R>
  ) => Effect.Effect<A, E, R>
) {
  return {
    /**
     * List auth configs with optional filters. Returns a single page of results.
     * @param params - Search/filter parameters
     */
    list: (params: {
      search?: string;
      toolkit_slug?: string;
      limit?: number;
      show_disabled?: boolean;
    }) =>
      withMetrics(
        callClient(
          clientSingleton,
          client =>
            client.authConfigs.list({
              search: params.search,
              toolkit_slug: params.toolkit_slug,
              limit: params.limit,
              show_disabled: params.show_disabled ?? true,
            }),
          AuthConfigListResponse
        )
      ),
    /**
     * Retrieves detailed info about a single auth config by its nanoid.
     * @param nanoid - Auth config ID
     */
    retrieve: (nanoid: string) =>
      withMetrics(
        callClient(
          clientSingleton,
          client => client.authConfigs.retrieve(nanoid),
          AuthConfigRetrieveResponse
        )
      ),
    /**
     * Creates a new auth config for a toolkit.
     * @param params - Create parameters (discriminated union: use_composio_managed_auth | use_custom_auth)
     */
    create: (params: AuthConfigCreateParams) =>
      withMetrics(
        callClient(
          clientSingleton,
          client => client.authConfigs.create(params),
          AuthConfigCreateResponse
        )
      ),
    /**
     * Soft-deletes an auth config by its nanoid.
     * @param nanoid - Auth config ID
     */
    delete: (nanoid: string) =>
      withMetrics(
        callClient(clientSingleton, client => client.authConfigs.delete(nanoid), Schema.Unknown)
      ),
  };
}

/**
 * Build the `connectedAccounts` namespace for ComposioClientLive.
 * Extracted to keep the main generator under the max-lines-per-function limit.
 */
function buildConnectedAccountsNamespace(
  clientSingleton: ComposioClientSingleton,
  withMetrics: <A, E, R>(
    effect: Effect.Effect<{ data: A; metrics: Metrics }, E, R>
  ) => Effect.Effect<A, E, R>
) {
  return {
    /**
     * List connected accounts with optional filters. Returns a single page of results.
     * @param params - Search/filter parameters
     */
    list: (params: {
      toolkit_slugs?: string[];
      user_ids?: string[];
      statuses?: string[];
      limit?: number;
    }) =>
      withMetrics(
        callClient(
          clientSingleton,
          client =>
            client.connectedAccounts.list({
              toolkit_slugs: params.toolkit_slugs,
              user_ids: params.user_ids,
              statuses: params.statuses as
                | Array<'INITIALIZING' | 'INITIATED' | 'ACTIVE' | 'FAILED' | 'EXPIRED' | 'INACTIVE'>
                | undefined,
              limit: params.limit,
            }),
          ConnectedAccountListResponse
        )
      ),
    /**
     * Retrieves detailed info about a single connected account by its nanoid.
     * @param nanoid - Connected account ID (e.g. "con_1a2b3c4d5e6f")
     */
    retrieve: (nanoid: string) =>
      withMetrics(
        callClient(
          clientSingleton,
          client => client.connectedAccounts.retrieve(nanoid),
          ConnectedAccountRetrieveResponse
        )
      ),
    /**
     * Soft-deletes a connected account by its nanoid.
     * @param nanoid - Connected account ID
     */
    delete: (nanoid: string) =>
      withMetrics(
        callClient(
          clientSingleton,
          client => client.connectedAccounts.delete(nanoid),
          Schema.Unknown
        )
      ),
    /**
     * Creates a new authentication link session for connecting an external account.
     * @param params - auth_config_id and user_id
     */
    createLink: (params: { auth_config_id: string; user_id: string }) =>
      withMetrics(
        callClient(clientSingleton, client => client.link.create(params), LinkCreateResponse)
      ),
  };
}

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
           * Automatically handles pagination to fetch all items.
           */
          list: () =>
            withMetrics(
              callClientWithPagination(
                clientSingleton,
                (client, cursor, limit) => client.toolkits.list({ cursor, limit }),
                ToolkitsResponse
              )
            ),
          /**
           * Retrieves a single toolkit by its slug.
           * Transforms the response to match the Toolkit schema.
           */
          retrieve: (slug: string) =>
            withMetrics(
              callClient(
                clientSingleton,
                client => client.toolkits.retrieve(slug),
                ToolkitRetrieveResponse
              )
            ).pipe(
              // Transform to Toolkit format by adding missing fields
              Effect.map(
                retrieved =>
                  ({
                    name: retrieved.name,
                    slug: retrieved.slug,
                    auth_schemes: [], // retrieve endpoint doesn't return auth_schemes
                    composio_managed_auth_schemes: retrieved.composio_managed_auth_schemes,
                    is_local_toolkit: retrieved.is_local_toolkit,
                    no_auth: retrieved.no_auth,
                    meta: retrieved.meta,
                  }) satisfies Toolkit
              )
            ),
          /**
           * Searches toolkits with optional filters. Returns a single page of results (no auto-pagination).
           * @param params - Search/filter parameters
           */
          search: (params: {
            search?: string;
            category?: string;
            limit?: number;
            cursor?: string;
          }) =>
            withMetrics(
              callClient(
                clientSingleton,
                client =>
                  client.toolkits.list({
                    search: params.search,
                    category: params.category,
                    limit: params.limit,
                    cursor: params.cursor,
                  }),
                ToolkitSearchResponse
              )
            ).pipe(
              Effect.map(
                response =>
                  ({
                    items: response.items,
                    total_items: response.total_items,
                    total_pages: response.total_pages,
                    next_cursor: response.next_cursor,
                  }) satisfies ToolkitSearchResult
              )
            ),
          /**
           * Retrieves detailed toolkit info including auth_config_details.
           * @param slug - Toolkit slug
           */
          retrieveDetailed: (slug: string) =>
            withMetrics(
              callClient(
                clientSingleton,
                client => client.toolkits.retrieve(slug),
                ToolkitDetailedResponse
              )
            ),
        },
        tools: buildToolsNamespace(clientSingleton, withMetrics),
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
           * Retrieve a list of trigger types, automatically handling pagination.
           * @param toolkitSlugs - Optional array of toolkit slugs to filter by
           */
          list: (toolkitSlugs?: ReadonlyArray<string>) =>
            withMetrics(
              callClientWithPagination(
                clientSingleton,
                (client, cursor, limit) =>
                  client.triggersTypes.list({
                    cursor,
                    limit,
                    toolkit_slugs: toolkitSlugs ? [...toolkitSlugs] : undefined,
                  }),
                TriggerTypesResponse
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
        authConfigs: buildAuthConfigsNamespace(clientSingleton, withMetrics),
        connectedAccounts: buildConnectedAccountsNamespace(clientSingleton, withMetrics),
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

      const getToolkits = () =>
        client.toolkits.list().pipe(
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

      /**
       * Fetches specific toolkits by their slugs.
       * Makes parallel API calls to retrieve each toolkit.
       * @param slugs - Array of toolkit slugs to fetch
       */
      const getToolkitsBySlugs = (slugs: ReadonlyArray<string>) =>
        Effect.all(
          slugs.map(slug =>
            client.toolkits.retrieve(slug).pipe(
              // Only convert 404 errors to InvalidToolkitsError.
              // Other HTTP errors (500, 401, network failures, etc.) should propagate as-is.
              Effect.catchTag('services/HttpServerError', e =>
                Effect.if(e.status === 404, {
                  onTrue: () =>
                    Effect.fail(
                      new InvalidToolkitsError({
                        invalidToolkits: [slug],
                        availableToolkits: [],
                      })
                    ),
                  onFalse: () => Effect.fail(e),
                })
              )
            )
          ),
          { concurrency: MAX_CONCURRENT_REQUESTS_PER_ENDPOINT }
        ).pipe(
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
        getToolkitsBySlugs,
        getMetrics: () => client.getMetrics(),
        getToolsAsEnums: () => client.tools.retrieveEnum(),
        /**
         * Fetches tools with optional toolkit filtering.
         * When toolkitSlugs is provided, fetches all matching tools.
         * @param toolkitSlugs - Optional array of toolkit slugs to filter by
         */
        getTools: (toolkitSlugs?: ReadonlyArray<string>) =>
          client.tools.list(toolkitSlugs ?? []).pipe(
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
        /**
         * Fetches tools with per-toolkit version support.
         * Groups toolkits by version and makes separate API calls for each group.
         * @param specs - Array of { toolkitSlug, toolkitVersion } specifications
         */
        getToolsByVersionSpecs: (specs: ReadonlyArray<ToolkitVersionSpec>) =>
          client.tools.listByVersionSpecs(specs).pipe(
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
        /**
         * Fetches trigger types with optional toolkit filtering.
         * When toolkitSlugs is provided, fetches all matching trigger types.
         * @param toolkitSlugs - Optional array of toolkit slugs to filter by
         */
        getTriggerTypes: (toolkitSlugs?: ReadonlyArray<string>) =>
          client.triggersTypes.list(toolkitSlugs).pipe(
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
        /**
         * Validates that the requested toolkit versions exist in the API's available_versions.
         * Makes parallel API calls to fetch toolkit metadata for validation.
         *
         * @param overrides - Map of toolkit slug to requested version
         * @param relevantToolkits - Optional array of toolkit slugs to validate (if --toolkits filter is used)
         * @returns Effect that succeeds with the validated overrides and warnings, or fails with InvalidToolkitVersionsError
         */
        validateToolkitVersions: (
          overrides: ToolkitVersionOverrides,
          relevantToolkits?: ReadonlyArray<string>
        ): Effect.Effect<
          {
            validatedOverrides: ToolkitVersionOverrides;
            warnings: ReadonlyArray<string>;
          },
          InvalidToolkitVersionsError | InvalidToolkitsError | HttpError | NoSuchElementException
        > => validateToolkitVersionsImpl(client, overrides, relevantToolkits),
        /**
         * Searches toolkits with optional filters. Returns a single page of results.
         * @param params - Search/filter parameters
         */
        searchToolkits: (params: {
          search?: string;
          category?: string;
          limit?: number;
          cursor?: string;
        }) => client.toolkits.search(params),
        /**
         * Retrieves detailed toolkit info including auth_config_details.
         * @param slug - Toolkit slug
         */
        getToolkitDetailed: (slug: string) => client.toolkits.retrieveDetailed(slug),
        /**
         * Searches tools with optional filters. Returns a single page of results.
         * @param params - Search/filter parameters
         */
        searchTools: (params: {
          search?: string;
          toolkit_slug?: string;
          tags?: string;
          limit?: number;
          cursor?: string;
        }) => client.tools.search(params),
        /**
         * Retrieves detailed info about a single tool by slug.
         * @param slug - Tool slug (e.g. "GMAIL_SEND_EMAIL")
         */
        getToolDetailed: (slug: string) => client.tools.retrieve(slug),
        /**
         * Lists auth configs with optional filters. Returns a single page of results.
         * @param params - Search/filter parameters
         */
        listAuthConfigs: (params: {
          search?: string;
          toolkit_slug?: string;
          limit?: number;
          show_disabled?: boolean;
        }) => client.authConfigs.list(params),
        /**
         * Retrieves detailed info about a single auth config by its nanoid.
         * @param nanoid - Auth config ID
         */
        getAuthConfig: (nanoid: string) => client.authConfigs.retrieve(nanoid),
        /**
         * Creates a new auth config for a toolkit.
         * @param params - Create parameters (discriminated union: use_composio_managed_auth | use_custom_auth)
         */
        createAuthConfig: (params: AuthConfigCreateParams) => client.authConfigs.create(params),
        deleteAuthConfig: (nanoid: string) => client.authConfigs.delete(nanoid),
        // Connected account operations (thin wrappers — see buildConnectedAccountsNamespace)
        listConnectedAccounts: (params: {
          toolkit_slugs?: string[];
          user_ids?: string[];
          statuses?: string[];
          limit?: number;
        }) => client.connectedAccounts.list(params),
        getConnectedAccount: (nanoid: string) => client.connectedAccounts.retrieve(nanoid),
        deleteConnectedAccount: (nanoid: string) => client.connectedAccounts.delete(nanoid),
        createConnectedAccountLink: (params: { auth_config_id: string; user_id: string }) =>
          client.connectedAccounts.createLink(params),
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
