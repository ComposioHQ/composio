import { Context, Effect, Layer, Option, Stream, Array, Order } from 'effect';
import * as Str from 'effect/String';
import type { Cause } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import {
  // eslint-disable-next-line no-restricted-imports -- this module is the one place the client is built
  make as makeComposioClient,
  Auth,
  type ComposioClientShape,
  type ConfigurationError,
} from '@composio/client/effect';
// Types `client._internal`: the CLI-only operations the spec tags `x-internal`
// (login sessions, realtime credentials, logs, consumer projects).
import type {} from '@composio/client/effect/internal';
import { Toolkit, Toolkits, ToolkitDetailed } from 'src/models/toolkits';
import { ToolsAsEnums, Tools } from 'src/models/tools';
import {
  groupByVersion,
  type ToolkitVersionSpec,
  type ToolkitVersionOverrides,
} from 'src/effects/toolkit-version-overrides';
import { Session, RetrievedSession } from 'src/models/session';
import { TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import { cliClientIdentity } from './client-provenance';
import { sha256Hex } from 'src/utils/checksums';
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

/**
 * Which key a client sends: the user's (`userApiKey`, defaulting to the
 * logged-in user's), or a project key in its place.
 */
type ClientCredential =
  | { readonly userApiKey?: string; readonly projectApiKey?: undefined }
  | { readonly projectApiKey: string; readonly userApiKey?: undefined };

/**
 * Whose requests a client sends. The org and project headers are only sent
 * together, so a scope names both or neither.
 */
export type ClientScope = ClientCredential &
  (
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
   * The client for an explicit scope. `userApiKey` defaults to the user's key;
   * a `projectApiKey` is sent instead of any user key.
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

// What each client built here addresses: its auth mode, a SHA-256 fingerprint
// of its credential (never the key itself), org, and project. `getFor` builds
// a new client on every call, so a memo over a client's reads keys on this
// rather than on the instance.
const clientScopeKeys = new WeakMap<ComposioClientShape, string>();
let nextUnscopedClient = 0;

/**
 * A memo key for what `client` addresses. Two clients from
 * {@link ComposioClientSingleton} with the same credential, org, and project
 * share it; a client built anywhere else (a test double) gets one of its own.
 */
export const clientScopeKey = (client: ComposioClientShape): string => {
  let key = clientScopeKeys.get(client);
  if (key === undefined) {
    key = `instance:${nextUnscopedClient++}`;
    clientScopeKeys.set(client, key);
  }
  return key;
};

/**
 * Singleton service that lazily accesses `Config` only when needed, which is used to build and provide
 * a Composio client instance from `@composio/client/effect`.
 *
 * Clients are built with `make`, which never consults the ambient process
 * environment: every credential and the base URL come from the CLI's own
 * configuration. Custom HTTP base URLs remain supported. A client
 * authenticates with `Auth.user` and the user key, with `Auth.project` when a
 * caller names a project key, and with `Auth.none()` before anyone has logged
 * in; the org and project go in its `scope`. No credential or scope header is
 * placed in `defaultHeaders`, which the client refuses while `auth` and
 * `scope` own them.
 *
 * Every lookup builds a new client (`make` costs a few microseconds), so no
 * credential is held anywhere but in the client a caller is using.
 */
const makeComposioClientSingleton = (metrics: ClientMetricsCollector) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const projectContextOpt = yield* Effect.serviceOption(ProjectContext);
    const httpClient = yield* HttpClient.HttpClient;

    // Read from disk once per process, with the services captured here.
    const sessionIdServices =
      yield* Effect.context<Effect.Services<ReturnType<typeof getCurrentCwdSessionId>>>();
    const currentCwdSessionId = yield* Effect.cached(
      getCurrentCwdSessionId().pipe(Effect.provideContext(sessionIdServices))
    );

    // `ctx.data` is read per call: a login or logout changes the user key.
    const getFor = (params?: ClientScope) =>
      Effect.gen(function* () {
        const cliSessionId = yield* currentCwdSessionId;
        const userApiKey = normalizeApiKey(
          params?.userApiKey ?? Option.getOrUndefined(ctx.data.apiKey)
        );
        const auth =
          params?.projectApiKey !== undefined
            ? Auth.project(params.projectApiKey)
            : userApiKey !== undefined
              ? Auth.user(userApiKey)
              : Auth.none();
        const orgId = params?.orgId;
        const projectId = params?.projectId;
        const credential = params?.projectApiKey ?? userApiKey;
        const credentialFingerprint =
          credential !== undefined
            ? yield* Effect.promise(() => sha256Hex(new TextEncoder().encode(credential)))
            : '';

        const client = yield* Effect.try({
          try: () =>
            // A call that passes `decode: true` has its response validated
            // against the client's schema for that operation.
            makeComposioClient(
              {
                auth,
                scope:
                  orgId !== undefined && projectId !== undefined
                    ? { organizationId: orgId, projectId }
                    : undefined,
                baseURL: ctx.data.baseURL,
                // Preserve support for explicitly configured HTTP backends.
                allowInsecureHTTP: true,
                // The identity headers come from here; the client refuses them
                // in `defaultHeaders`.
                identity: cliClientIdentity(),
                defaultHeaders:
                  cliSessionId !== undefined ? { 'x-cli-session-id': cliSessionId } : undefined,
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
        clientScopeKeys.set(
          client,
          `${auth.mode}\u0000${credentialFingerprint}\u0000${orgId ?? ''}\u0000${projectId ?? ''}`
        );
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
        Effect.flatMap(c => c._internal.cli.createSession({ scope: params?.scope ?? 'user' })),
        Effect.flatMap(decode(Session))
      ),
    /**
     * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
     */
    getSession: (session: { id: string }) =>
      client.pipe(
        Effect.flatMap(c => c._internal.cli.getSession({ id: session.id }, idempotent)),
        Effect.flatMap(decode(RetrievedSession))
      ),
    getRealtimeCredentials: () =>
      Effect.flatMap(client, c =>
        c._internal.cli.realtime.credentials({ ...idempotent, ...validated })
      ),
    authRealtimeChannel: (params: { channel_name: string; socket_id: string }) =>
      Effect.flatMap(client, c => c._internal.cli.realtime.auth(params, idempotent)),
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
