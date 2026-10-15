import { Context, Effect, Layer, Option, Stream, Array, Order, String } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { Cause } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import {
  make as makeComposioClient,
  VERSION as clientLibraryVersion,
  type ComposioClientShape,
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
import { makeClientMetricsCollector } from './composio-client-metrics';
import { ComposioClientConfigurationError, type ClientError } from './composio-errors';
import { MAX_CONCURRENT_REQUESTS_PER_ENDPOINT, decode, undecoded } from './composio-request';
import { lookupOperations, resourceOperations } from './composio-resource-operations';
import { composioSchemaLoaders } from './composio-schema-loaders';
import { NodeOs } from './node-os';
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
 * Shape exposed by {@link ComposioClientSingleton}.
 */
export interface ComposioClientSingletonShape {
  /**
   * The client for the user's key and, when the working directory resolves to
   * a project, that project's org and project.
   */
  readonly get: () => Effect.Effect<
    ComposioClientShape,
    ComposioClientConfigurationError | NoSuchElementError
  >;
  /**
   * The client for an explicit scope. `userApiKey` defaults to the user's key.
   */
  readonly getFor: (params: {
    userApiKey?: string;
    orgId?: string;
    projectId?: string;
  }) => Effect.Effect<ComposioClientShape, ComposioClientConfigurationError | NoSuchElementError>;
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
const makeComposioClientSingleton = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const projectContextOpt = yield* Effect.serviceOption(ProjectContext);
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const os = yield* NodeOs;
  const metrics = makeClientMetricsCollector();
  // A private memo map: under an application that already built
  // `FetchHttpClient.layer`, a shared one would hand back that transport,
  // which calls `globalThis.fetch` directly and counts nothing.
  const httpClient = yield* Effect.provide(
    HttpClient.HttpClient,
    Layer.provide(FetchHttpClient.layer, Layer.succeed(FetchHttpClient.Fetch, metrics.fetch)),
    { local: true }
  );
  const cache = new Map<string, ComposioClientShape>();

  const getFor = (params?: { userApiKey?: string; orgId?: string; projectId?: string }) =>
    Effect.gen(function* () {
      const apiKey = normalizeApiKey(params?.userApiKey ?? Option.getOrUndefined(ctx.data.apiKey));
      const cacheKey = JSON.stringify({
        apiKey: apiKey ?? null,
        orgId: params?.orgId ?? null,
        projectId: params?.projectId ?? null,
      });
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const cliSessionId = yield* getCurrentCwdSessionId().pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(NodeOs, os)
      );

      const client = yield* Effect.try({
        try: () =>
          // Responses are validated against the CLI's loader table unless a
          // call passes `decode: false`.
          makeComposioClient(
            {
              apiKey: null,
              userApiKey: apiKey ?? null,
              orgApiKey: null,
              baseURL: ctx.data.baseURL,
              // Preserve support for explicitly configured HTTP backends.
              allowInsecureHTTP: true,
              deprecationNotices: 'off',
              defaultHeaders: buildDefaultHeaders({
                userApiKey: apiKey,
                orgId: params?.orgId,
                projectId: params?.projectId,
                cliSessionId,
              }),
              decode: true,
              schemas: composioSchemaLoaders,
            },
            httpClient
          ),
        catch: cause =>
          new ComposioClientConfigurationError({
            message: cause instanceof Error ? cause.message : global.String(cause),
            cause,
          }),
      });

      cache.set(cacheKey, client);
      return client;
    });

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
    getFor: Effect.fn(function* (params: {
      userApiKey?: string;
      orgId?: string;
      projectId?: string;
    }) {
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
  static readonly Default = Layer.effect(ComposioClientSingleton, makeComposioClientSingleton).pipe(
    Layer.provide(ComposioUserContextLive)
  );
}
/**
 * Repositories
 */

const makeComposioToolkitsRepository = Effect.gen(function* () {
  const clientSingleton = yield* ComposioClientSingleton;
  const client = clientSingleton.get();

  const listToolkits = (managedBy?: 'project', scope?: ToolkitProjectScope) =>
    collectAll(scope ? clientSingleton.getFor(scope) : client, c =>
      c.toolkits.listStream({ limit: MAX_PAGE_SIZE, managed_by: managedBy }, undecoded)
    ).pipe(Effect.flatMap(decode(Toolkits)), Effect.map(sortBySlug));

  const getToolkitDetailed = (slug: string) =>
    client.pipe(
      Effect.flatMap(c => c.toolkits.retrieve(slug, undefined, undecoded)),
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
    collectAll(client, c => c.tools.listStream({ ...query, limit: MAX_PAGE_SIZE }, undecoded)).pipe(
      Effect.flatMap(decode(Tools))
    );

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
        Effect.flatMap(c => c.tools.retrieveEnum(undecoded)),
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
        Effect.flatMap(c => c.triggersTypes.retrieveEnum(undecoded)),
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
          { limit: MAX_PAGE_SIZE, toolkit_slugs: toolkitSlugs ? [...toolkitSlugs] : undefined },
          undecoded
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
        const normalizedInputSlugs = toolkitSlugs.map(slug => String.toLowerCase(slug));

        // Fetch all available toolkits
        const allToolkits = yield* getToolkits();
        const availableSlugs = allToolkits.map(toolkit => String.toLowerCase(toolkit.slug));

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
        Effect.flatMap(c => c.cli.createSession({ scope: params?.scope ?? 'user' }, undecoded)),
        Effect.flatMap(decode(Session))
      ),
    /**
     * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
     */
    getSession: (session: { id: string }) =>
      client.pipe(
        Effect.flatMap(c => c.cli.getSession({ id: session.id }, undecoded)),
        Effect.flatMap(decode(RetrievedSession))
      ),
    getRealtimeCredentials: () => Effect.flatMap(client, c => c.cli.realtime.credentials()),
    authRealtimeChannel: (params: { channel_name: string; socket_id: string }) =>
      Effect.flatMap(client, c => c.cli.realtime.auth(params, undecoded)),
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
