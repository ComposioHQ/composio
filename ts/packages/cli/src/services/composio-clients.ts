import {
  Cache,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Stream,
  Array,
  Order,
} from 'effect';
import * as Str from 'effect/String';
import type { Cause } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import {
  // eslint-disable-next-line no-restricted-imports -- this module is the one place the client is built
  make as makeComposioClient,
  VERSION as clientLibraryVersion,
  type ComposioClientShape,
  type ConfigurationError,
} from '@composio/client/effect';
import { Toolkit, Toolkits, ToolkitDetailed } from 'src/models/toolkits';
import { ToolsAsEnums, Tools } from 'src/models/tools';
import {
  groupByVersion,
  type ToolkitVersionSpec,
  type ToolkitVersionOverrides,
} from 'src/effects/toolkit-version-overrides';
import { Session, RetrievedSession } from 'src/models/session';
import { TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import { cliRequestHeaders } from './client-provenance';
import { getCurrentCwdSessionId } from 'src/analytics/dispatch';
import { ComposioUserContext, ComposioUserContextLive } from './user-context';
import { ProjectContext } from './project-context';
import { makeClientMetricsCollector, type ClientMetricsCollector } from './composio-client-metrics';
import { ComposioClientConfigurationError, type ClientError } from './composio-errors';
import { isClientConfigurationError } from 'src/utils/api-error-extraction';
import {
  MAX_CONCURRENT_REQUESTS_PER_ENDPOINT,
  decode,
  idempotent,
  validated,
} from './composio-request';
import { lookupOperations, resourceOperations } from './composio-resource-operations';
import { schemaLoaders } from '@composio/client/effect/schemas';
import {
  InvalidToolkitsError,
  invalidToolkitOn404,
  validateToolkitVersionsImpl,
  type InvalidToolkitVersionsError,
} from './toolkit-version-validation';

type NoSuchElementError = Cause.NoSuchElementError;

/**
 * Request helpers
 */

// Maximum items per page allowed by the server
const MAX_PAGE_SIZE = 1000;

/**
 * Runs a paginated listing to exhaustion and returns every item. A page is
 * requested only once the one before it arrived, so interrupting the listing
 * sends no further request.
 */
const collectAll = <A, E, E2>(
  client: Effect.Effect<ComposioClientShape, E>,
  list: (client: ComposioClientShape) => Stream.Stream<A, E2>
): Effect.Effect<Array<A>, E | E2> =>
  Effect.flatMap(client, resolved => Stream.runCollect(list(resolved)));

// Sort items by slug.
// TODO: make sure this happens on the server-side.
const sortBySlug = <T extends { readonly slug: string }>(
  items: ReadonlyArray<T>
): ReadonlyArray<T> =>
  Array.sort(
    items,
    Order.mapInput(Order.String, (item: T) => item.slug)
  );

/**
 * Client singleton
 */

const normalizeApiKey = (rawApiKey?: string): string | undefined =>
  typeof rawApiKey === 'string' && rawApiKey.trim().length > 0 ? rawApiKey : undefined;

const buildDefaultHeaders = (params: {
  userApiKey?: string;
  orgId?: string;
  projectId?: string;
  cliSessionId?: string;
}): Record<string, string> | undefined => {
  const defaultHeaders = {
    ...cliRequestHeaders(),
    'x-client-library': '@composio/client',
    'x-client-library-version': clientLibraryVersion,
    ...(params.userApiKey
      ? ({ 'x-user-api-key': params.userApiKey } satisfies Record<string, string>)
      : {}),
    ...(params.orgId && params.projectId
      ? ({
          'x-org-id': params.orgId,
          'x-project-id': params.projectId,
        } satisfies Record<string, string>)
      : {}),
    ...(params.cliSessionId
      ? ({ 'x-cli-session-id': params.cliSessionId } satisfies Record<string, string>)
      : {}),
  };

  return defaultHeaders;
};

/**
 * Whose requests a client sends. The org and project headers are only sent
 * together, so a scope names both or neither.
 */
export type ClientScope = { readonly userApiKey?: string } & (
  | { readonly orgId: string; readonly projectId: string }
  | { readonly orgId?: undefined; readonly projectId?: undefined }
);

/**
 * Shape exposed by {@link ComposioClientSingleton}.
 */
export interface ComposioClientSingletonShape {
  /**
   * The client for the user's key and, when the working directory resolves to
   * a project, that project's org and project.
   */
  readonly get: () => Effect.Effect<ComposioClientShape, ClientBuildError | NoSuchElementError>;
  /**
   * The client for an explicit scope. `userApiKey` defaults to the user's key.
   */
  readonly getFor: (
    params: ClientScope
  ) => Effect.Effect<ComposioClientShape, ClientBuildError | NoSuchElementError>;
  /**
   * Returns a snapshot of the accumulated metrics (total bytes received and
   * request count) across every client this singleton built.
   */
  readonly getMetrics: () => Effect.Effect<{
    readonly byteSize: number;
    readonly requests: number;
  }>;
}

/**
 * Why a client could not be built: the client's own `ConfigurationError`
 * (a base URL it refuses, say) or a failure the CLI only knows as a thrown value.
 */
export type ClientBuildError = ConfigurationError | ComposioClientConfigurationError;

/**
 * The scope a client is built for, with the user key resolved. A plain record
 * is compared and hashed structurally by `Equal` and `Hash`, so two lookups
 * with the same fields resolve to the same cache entry.
 */
interface ResolvedClientScope {
  readonly userApiKey: string | undefined;
  readonly orgId: string | undefined;
  readonly projectId: string | undefined;
}

/**
 * Singleton service that lazily accesses `Config` only when needed, which is used to build and provide
 * a Composio client instance from `@composio/client/effect`.
 *
 * Clients are built with `make`, which never consults the ambient process
 * environment: every credential and the base URL come from the CLI's own
 * configuration. Custom HTTP base URLs remain supported. The user key is
 * placed in `defaultHeaders` as `x-user-api-key`, which keeps today's wire
 * bytes on every operation; it is also passed as `userApiKey`, while the
 * caller-placed header still wins at dispatch.
 */
const makeComposioClientSingleton = (metrics: ClientMetricsCollector) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const projectContextOpt = yield* Effect.serviceOption(ProjectContext);
    const httpClient = yield* HttpClient.HttpClient;

    const buildClient = (scope: ResolvedClientScope) =>
      Effect.gen(function* () {
        const cliSessionId = yield* getCurrentCwdSessionId();

        return yield* Effect.try({
          try: () =>
            // A call that passes `decode: true` has its response validated
            // against the client's schema for that operation.
            makeComposioClient(
              {
                apiKey: null,
                userApiKey: scope.userApiKey ?? null,
                orgApiKey: null,
                baseURL: ctx.data.baseURL,
                // Preserve support for explicitly configured HTTP backends.
                allowInsecureHTTP: true,
                deprecationNotices: 'off',
                defaultHeaders: buildDefaultHeaders({
                  userApiKey: scope.userApiKey,
                  orgId: scope.orgId,
                  projectId: scope.projectId,
                  cliSessionId,
                }),
                // Only a call that passes `idempotent` is retried.
                maxRetries: 0,
                schemas: schemaLoaders,
              },
              httpClient
            ),
          // The client's own error is kept as it is; anything else thrown is
          // reported as the CLI's configuration error.
          catch: (cause): ClientBuildError =>
            isClientConfigurationError(cause)
              ? cause
              : new ComposioClientConfigurationError({
                  message: cause instanceof Error ? cause.message : String(cause),
                  cause,
                }),
        });
      });

    // One client per scope, built once: concurrent first callers share the
    // in-flight build. The lookup reads the session id from disk with the
    // services captured here. A failed build is not kept (its entry's time to
    // live is zero), so the next caller builds again instead of replaying a
    // configuration error that a later login may have fixed.
    const clients = yield* Cache.makeWith(buildClient, {
      capacity: 64,
      timeToLive: exit => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
    });

    // `ctx.data` is read per call: a login or logout changes the user key,
    // and with it the scope.
    const getFor = (params?: ClientScope) =>
      Effect.suspend(() =>
        Cache.get(clients, {
          userApiKey: normalizeApiKey(params?.userApiKey ?? Option.getOrUndefined(ctx.data.apiKey)),
          orgId: params?.orgId,
          projectId: params?.projectId,
        })
      );

    return {
      get: Effect.fn(function* () {
        const resolvedProjectContext = yield* Option.match(projectContextOpt, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: projectContext =>
            projectContext.resolve.pipe(Effect.catch(() => Effect.succeed(Option.none()))),
        });
        return yield* Option.match(resolvedProjectContext, {
          onNone: () => getFor(),
          onSome: keys =>
            getFor({
              orgId: keys.orgId,
              projectId: keys.projectId,
            }),
        });
      }),
      getFor: Effect.fn(function* (params: ClientScope) {
        return yield* getFor(params);
      }),
      getMetrics: metrics.getMetrics,
    } satisfies ComposioClientSingletonShape;
  });

/**
 * The org/project a project-scoped request is made for, as a command resolved it.
 */
export interface ToolkitProjectScope {
  readonly orgId: string;
  readonly projectId: string;
}

export class ComposioClientSingleton extends Context.Service<
  ComposioClientSingleton,
  ComposioClientSingletonShape
>()('services/ComposioClientSingleton') {
  // The singleton and its transport share one metrics collector, created
  // when the layer is built. The transport is a fresh `FetchHttpClient.layer`
  // rather than the memoized one an application may already have built
  // (`cli-main.ts` provides its own), because that one calls
  // `globalThis.fetch` directly and counts nothing; this one is built over
  // the counting `fetch`.
  static readonly Default = Layer.unwrap(
    Effect.sync(() => {
      const metrics = makeClientMetricsCollector();
      return Layer.effect(ComposioClientSingleton, makeComposioClientSingleton(metrics)).pipe(
        Layer.provide(
          Layer.fresh(FetchHttpClient.layer).pipe(
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, metrics.fetch))
          )
        )
      );
    })
  ).pipe(Layer.provide(ComposioUserContextLive));
}
/**
 * Repositories
 */

const makeComposioToolkitsRepository = Effect.gen(function* () {
  const clientSingleton = yield* ComposioClientSingleton;
  const client = clientSingleton.get();

  const listToolkits = (managedBy?: 'project', scope?: ToolkitProjectScope) =>
    collectAll(scope ? clientSingleton.getFor(scope) : client, c =>
      c.toolkits.listStream({ limit: MAX_PAGE_SIZE, managed_by: managedBy }, idempotent)
    ).pipe(Effect.flatMap(decode(Toolkits)), Effect.map(sortBySlug));

  const getToolkitDetailed = (slug: string) =>
    client.pipe(
      Effect.flatMap(c => c.toolkits.retrieve(slug, undefined, idempotent)),
      Effect.flatMap(decode(ToolkitDetailed))
    );

  // The retrieve endpoint omits `auth_schemes`; fill it so the result
  // satisfies the catalog `Toolkit` contract.
  const getToolkit = (slug: string): Effect.Effect<Toolkit, ClientError> =>
    getToolkitDetailed(slug).pipe(
      Effect.map(({ auth_config_details: _authConfigDetails, ...toolkit }) => ({
        ...toolkit,
        auth_schemes: [],
      }))
    );

  const getToolkits = () => listToolkits();

  /**
   * Fetches the custom toolkits registered in the current project. They are
   * project-scoped, so they are absent from the build-time catalog and from
   * {@link getToolkits}, whose callers expect Composio-managed toolkits only.
   * @param scope - The org/project the command resolved; without it, the
   *   project context decides, which is no project at all in consumer mode
   */
  const getProjectToolkits = (scope?: ToolkitProjectScope) => listToolkits('project', scope);

  /**
   * Fetches specific toolkits by their slugs.
   * Makes parallel API calls to retrieve each toolkit.
   * @param slugs - Array of toolkit slugs to fetch
   */
  const getToolkitsBySlugs = (slugs: ReadonlyArray<string>) =>
    Effect.all(
      slugs.map(slug => invalidToolkitOn404(slug, getToolkit(slug))),
      { concurrency: MAX_CONCURRENT_REQUESTS_PER_ENDPOINT }
    ).pipe(Effect.map(sortBySlug));

  const listTools = (query: { toolkit_slug?: string; toolkit_versions: string }) =>
    collectAll(client, c =>
      c.tools.listStream({ ...query, limit: MAX_PAGE_SIZE }, idempotent)
    ).pipe(Effect.flatMap(decode(Tools)));

  return {
    getToolkits,
    getProjectToolkits,
    getToolkitsBySlugs,
    getMetrics: () => clientSingleton.getMetrics(),
    /**
     * Retrieve a list of all available tool enumeration values (tool slugs) for the project.
     */
    getToolsAsEnums: () =>
      client.pipe(
        Effect.flatMap(c => c.tools.retrieveEnum(idempotent)),
        Effect.flatMap(decode(ToolsAsEnums))
      ),
    /**
     * Fetches tools with optional toolkit filtering, always at the latest
     * toolkit version. For per-toolkit versions use `getToolsByVersionSpecs`.
     * @param toolkitSlugs - Optional array of toolkit slugs to filter by
     */
    getTools: (toolkitSlugs?: ReadonlyArray<string>) =>
      listTools({
        toolkit_slug: toolkitSlugs && toolkitSlugs.length > 0 ? toolkitSlugs.join(',') : undefined,
        toolkit_versions: 'latest',
      }).pipe(Effect.map(sortBySlug)),
    /**
     * Fetches tools with per-toolkit version support.
     * Groups toolkits by version and makes separate API calls for each group.
     * @param specs - Array of { toolkitSlug, toolkitVersion } specifications
     */
    getToolsByVersionSpecs: (specs: ReadonlyArray<ToolkitVersionSpec>) =>
      Effect.all(
        [...groupByVersion(specs).entries()].map(([version, slugs]) =>
          listTools({ toolkit_slug: slugs.join(','), toolkit_versions: version })
        ),
        { concurrency: MAX_CONCURRENT_REQUESTS_PER_ENDPOINT }
      ).pipe(Effect.map(groups => sortBySlug(groups.flat()))),
    /**
     * Retrieves a list of all available trigger type enum values that can be used across the API.
     */
    getTriggerTypesAsEnums: () =>
      client.pipe(
        Effect.flatMap(c => c.triggersTypes.retrieveEnum(idempotent)),
        Effect.flatMap(decode(TriggerTypesAsEnums))
      ),
    /**
     * Fetches trigger types with optional toolkit filtering.
     * When toolkitSlugs is provided, fetches all matching trigger types.
     * @param toolkitSlugs - Optional array of toolkit slugs to filter by
     */
    getTriggerTypes: (toolkitSlugs?: ReadonlyArray<string>) =>
      collectAll(client, c =>
        c.triggersTypes.listStream(
          {
            limit: MAX_PAGE_SIZE,
            toolkit_slugs: toolkitSlugs ? [...toolkitSlugs] : undefined,
          },
          idempotent
        )
      ).pipe(Effect.flatMap(decode(TriggerTypes)), Effect.map(sortBySlug)),
    /**
     * Validates that the given toolkit slugs are valid by comparing them against the list
     * of available toolkits. Returns the list of valid toolkit slugs (normalized to lowercase).
     * @param toolkitSlugs - Array of toolkit slugs to validate (case-insensitive)
     */
    validateToolkits: (
      toolkitSlugs: ReadonlyArray<string>
    ): Effect.Effect<ReadonlyArray<string>, InvalidToolkitsError | ClientError> =>
      Effect.gen(function* () {
        // Normalize input slugs to lowercase for comparison
        const normalizedInputSlugs = toolkitSlugs.map(slug => Str.toLowerCase(slug));

        // Fetch all available toolkits
        const allToolkits = yield* getToolkits();
        const availableSlugs = allToolkits.map(toolkit => Str.toLowerCase(toolkit.slug));

        // Find invalid slugs
        const invalidSlugs = normalizedInputSlugs.filter(slug => !availableSlugs.includes(slug));

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
      const normalizedSlugs = new Set(toolkitSlugs.map(slug => Str.toLowerCase(slug)));
      return toolkits.filter(toolkit => normalizedSlugs.has(Str.toLowerCase(toolkit.slug)));
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
      InvalidToolkitVersionsError | InvalidToolkitsError | ClientError
    > => validateToolkitVersionsImpl(getToolkit, overrides, relevantToolkits),
    /**
     * Retrieves detailed toolkit info including auth_config_details.
     * @param slug - Toolkit slug
     */
    getToolkitDetailed,
    ...lookupOperations(client),
    ...resourceOperations(client),
  };
});

export type ComposioToolkitsRepositoryShape = Effect.Success<typeof makeComposioToolkitsRepository>;

export class ComposioToolkitsRepository extends Context.Service<
  ComposioToolkitsRepository,
  ComposioToolkitsRepositoryShape
>()('services/ComposioToolkitsRepository') {
  static readonly Default = Layer.effect(
    ComposioToolkitsRepository,
    makeComposioToolkitsRepository
  ).pipe(Layer.provide(ComposioClientSingleton.Default));
}

const makeComposioSessionRepository = Effect.gen(function* () {
  const clientSingleton = yield* ComposioClientSingleton;
  const client = clientSingleton.get();

  return {
    /**
     * Generates a new CLI session with a random 6-character code.
     * @param params.scope - 'user' for login, 'project' for init (future)
     */
    createSession: (params?: { scope?: 'user' | 'project' }) =>
      client.pipe(
        Effect.flatMap(c => c.cli.createSession({ scope: params?.scope ?? 'user' })),
        Effect.flatMap(decode(Session))
      ),
    /**
     * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
     */
    getSession: (session: { id: string }) =>
      client.pipe(
        Effect.flatMap(c => c.cli.getSession({ id: session.id }, idempotent)),
        Effect.flatMap(decode(RetrievedSession))
      ),
    getRealtimeCredentials: () =>
      Effect.flatMap(client, c => c.cli.realtime.credentials({ ...idempotent, ...validated })),
    authRealtimeChannel: (params: { channel_name: string; socket_id: string }) =>
      Effect.flatMap(client, c => c.cli.realtime.auth(params, idempotent)),
  };
});

export type ComposioSessionRepositoryShape = Effect.Success<typeof makeComposioSessionRepository>;

export class ComposioSessionRepository extends Context.Service<
  ComposioSessionRepository,
  ComposioSessionRepositoryShape
>()('services/ComposioSessionRepository') {
  static readonly Default = Layer.effect(
    ComposioSessionRepository,
    makeComposioSessionRepository
  ).pipe(Layer.provide(ComposioClientSingleton.Default));
}
