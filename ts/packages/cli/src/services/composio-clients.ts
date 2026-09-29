import {
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
  Array,
  Order,
  String,
} from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { Cause } from 'effect';
import { Composio as _RawComposioClient, APIError, type RequestOptions } from '@composio/client';
import { paginate, type CursorPage } from '@composio/client/pagination';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import type { ConnectedAccountListParams } from '@composio/client/resources/connected-accounts';
import type { OrgListResponse, ProjectListResponse } from '@composio/client/resources/org';
import type {
  ConsumerListConnectedToolkitsResponse,
  ProjectResolveResponse,
} from '@composio/client/resources/org/consumer';
import type { SessionRetrieveInfoResponse } from '@composio/client/resources/auth';
import { Toolkit, Toolkits, ToolkitDetailed, type ToolkitSearchResult } from 'src/models/toolkits';
import { AuthConfigItem, AuthConfigItems } from 'src/models/auth-configs';
import { ConnectedAccountItem, ConnectedAccountItems } from 'src/models/connected-accounts';
import { TriggerInstanceItems } from 'src/models/triggers';
import { ToolsAsEnums, Tools } from 'src/models/tools';
import {
  groupByVersion,
  type ToolkitVersionSpec,
  type ToolkitVersionOverrides,
} from 'src/effects/toolkit-version-overrides';
import { Session, RetrievedSession } from 'src/models/session';
import { TriggerType, TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import * as constants from 'src/constants';
import { getCurrentCwdSessionId } from 'src/analytics/dispatch';
import { ComposioUserContext, ComposioUserContextLive } from './user-context';
import { ProjectContext } from './project-context';
import { makeClientMetricsCollector } from './composio-client-metrics';
import { NodeOs } from './node-os';

type NoSuchElementError = Cause.NoSuchElementError;

/**
 * Error types
 */

/**
 * Structured error details from the Composio API error envelope.
 */
export interface HttpErrorDetails {
  readonly message: string;
  readonly suggestedFix?: string;
  readonly code: number;
}

/**
 * Error thrown when a HTTP request fails.
 *
 * `status`, `details`, and `requestId` are populated from the client's
 * `APIError` when the failure is an API response; a connection failure or an
 * unexpected rejection carries only `cause`.
 */
export class HttpServerError extends Data.TaggedError('services/HttpServerError')<{
  readonly cause?: unknown;
  readonly status?: number;
  readonly details?: HttpErrorDetails;
  readonly requestId?: string;
}> {}

/**
 * Error thrown when a client cannot be constructed from the current configuration.
 */
export class ComposioClientConfigurationError extends Data.TaggedError(
  'services/ComposioClientConfigurationError'
)<{
  readonly message: string;
  readonly cause: unknown;
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

/**
 * Every failure a client call can produce: the request itself, decoding a
 * CLI-owned contract, or obtaining a client from the singleton.
 */
export type ClientError = HttpError | ComposioClientConfigurationError | NoSuchElementError;

/**
 * Request helpers
 */

// Maximum items per page allowed by the server
const MAX_PAGE_SIZE = 1000;

// Maximum concurrent requests per each endpoint
const MAX_CONCURRENT_REQUESTS_PER_ENDPOINT = 4;

const toHttpServerError = (cause: unknown): HttpServerError => {
  if (cause instanceof APIError) {
    const details = cause.details;
    return new HttpServerError({
      cause,
      status: cause.status,
      requestId: cause.requestId,
      details: details
        ? { message: details.message, code: details.code, suggestedFix: details.suggested_fix }
        : undefined,
    });
  }
  return new HttpServerError({ cause });
};

/**
 * Runs one client call. The client parses JSON and rejects on non-2xx, so the
 * only work left is mapping its rejection onto `HttpServerError`.
 */
const request = <A, E>(
  client: Effect.Effect<_RawComposioClient, E>,
  call: (client: _RawComposioClient, signal: AbortSignal) => PromiseLike<A>
): Effect.Effect<A, E | HttpServerError> =>
  client.pipe(
    Effect.flatMap(resolved =>
      Effect.tryPromise({ try: signal => call(resolved, signal), catch: toHttpServerError })
    )
  );

/**
 * Runs a paginated client call to exhaustion and returns every item, asking
 * for `MAX_PAGE_SIZE` items per page.
 */
const requestAll = <Page extends CursorPage<unknown>, E>(
  client: Effect.Effect<_RawComposioClient, E>,
  fetchPage: (
    client: _RawComposioClient,
    page: { readonly cursor: string | undefined; readonly limit: number },
    signal: AbortSignal
  ) => PromiseLike<Page>
) =>
  request(client, (resolved, signal) =>
    paginate<Page>(({ cursor }) =>
      fetchPage(resolved, { cursor, limit: MAX_PAGE_SIZE }, signal)
    ).toArray()
  );

/**
 * Decodes a payload against a CLI-owned contract.
 */
const decode =
  <S extends Schema.Top>(schema: S) =>
  (input: unknown): Effect.Effect<S['Type'], HttpDecodingError, S['DecodingServices']> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.catchTag(
        'SchemaError',
        e =>
          new HttpDecodingError({
            cause: `SchemaError\n   ${e.message}`,
          })
      )
    );

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
 * Converts a 404 from a toolkit lookup into `InvalidToolkitsError` naming
 * that slug; every other failure propagates unchanged.
 */
const invalidToolkitOn404 = <A>(slug: string, toolkit: Effect.Effect<A, ClientError>) =>
  Effect.catchTag(
    toolkit,
    'services/HttpServerError',
    (e): Effect.Effect<never, InvalidToolkitsError | HttpServerError> =>
      e.status === 404
        ? Effect.fail(
            new InvalidToolkitsError({
              invalidToolkits: [slug],
              availableToolkits: [],
            })
          )
        : Effect.fail(e)
  );

const validateToolkitVersionsImpl = (
  retrieveToolkit: (slug: string) => Effect.Effect<Toolkit, ClientError, never>,
  overrides: ToolkitVersionOverrides,
  relevantToolkits?: ReadonlyArray<string>
): Effect.Effect<
  {
    validatedOverrides: ToolkitVersionOverrides;
    warnings: ReadonlyArray<string>;
  },
  InvalidToolkitVersionsError | InvalidToolkitsError | ClientError
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
      InvalidToolkitsError | ClientError
    > =>
      Effect.all(
        overridesToValidate.map(([toolkit, requestedVersion]) =>
          invalidToolkitOn404(
            toolkit,
            retrieveToolkit(toolkit).pipe(
              Effect.map(toolkitData => ({
                toolkit,
                requestedVersion,
                availableVersions: toolkitData.meta.available_versions,
                isValid: toolkitData.meta.available_versions.includes(requestedVersion),
              }))
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
 * CLI-owned response contracts
 *
 * Response types otherwise come from `@composio/client`. A schema stays here
 * only where the CLI owns the contract: output allowlists that keep
 * credential-bearing fields off stdout, and the single escape-hatch endpoint
 * the client does not type.
 */

// Auth config list response (single page with total_items for "Listing X of Y" display)
export const AuthConfigListResponse = Schema.Struct({
  items: AuthConfigItems,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  current_page: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
}).annotate({ identifier: 'AuthConfigListResponse' });
export type AuthConfigListResponse = Schema.Schema.Type<typeof AuthConfigListResponse>;

// Connected account list response (single page with total_items for "Listing X of Y" display)
export const ConnectedAccountListResponse = Schema.Struct({
  items: ConnectedAccountItems,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  current_page: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
}).annotate({ identifier: 'ConnectedAccountListResponse' });
export type ConnectedAccountListResponse = Schema.Schema.Type<typeof ConnectedAccountListResponse>;

// `auth-configs create` prints this response to stdout, so it stays an
// allowlist rather than the client's full type: a field the API adds later
// must not reach a pipe without a decision here.
export const AuthConfigCreateResponse = Schema.Struct({
  auth_config: Schema.Struct({
    id: Schema.String,
    auth_scheme: Schema.String,
    is_composio_managed: Schema.Boolean,
  }),
  toolkit: Schema.Struct({
    slug: Schema.String,
  }),
}).annotate({ identifier: 'AuthConfigCreateResponse' });
export type AuthConfigCreateResponse = Schema.Schema.Type<typeof AuthConfigCreateResponse>;

export const LatestToolVersionResponse = Schema.Struct({
  tool_slug: Schema.String,
  version: Schema.String,
}).annotate({ identifier: 'LatestToolVersionResponse' });
export type LatestToolVersionResponse = Schema.Schema.Type<typeof LatestToolVersionResponse>;

/**
 * Session info as the CLI consumes it: the client's response with `project`
 * present. The endpoint answers `project: null` for org-level credentials,
 * which every caller here treats as an unusable session.
 */
export type SessionInfoResponse = SessionRetrieveInfoResponse & {
  readonly project: NonNullable<SessionRetrieveInfoResponse['project']>;
};

const requireSessionProject = (
  info: SessionRetrieveInfoResponse
): Effect.Effect<SessionInfoResponse, HttpDecodingError> =>
  info.project === null
    ? Effect.fail(
        new HttpDecodingError({
          cause: 'Session info response has no project (org-level credentials)',
        })
      )
    : Effect.succeed({ ...info, project: info.project });

/**
 * The org member's user id, falling back to the member id. The backend still
 * sends `org_member.user_id` although the v3.1 spec omits it, and the persisted
 * test user id derives from it, so it is read defensively.
 */
export const sessionUserIdOf = (info: SessionInfoResponse): string => {
  const member: object = info.org_member;
  return Predicate.hasProperty(member, 'user_id') && Predicate.isString(member.user_id)
    ? member.user_id
    : info.org_member.id;
};

/**
 * The project API key carried by a session, or null. The v3.1 spec names the
 * field `key`, and older responses spell it `api_key`; reading both keeps
 * `composio dev init` from minting a second key when the backend sends the
 * older spelling.
 */
export const sessionProjectApiKeyOf = (info: SessionInfoResponse): string | null => {
  const apiKey: object | null = info.api_key;
  if (apiKey === null) return null;
  if (Predicate.hasProperty(apiKey, 'api_key') && Predicate.isString(apiKey.api_key)) {
    return apiKey.api_key;
  }
  return info.api_key?.key ?? null;
};

/**
 * A single project entry returned by GET /api/v3.1/org/project/list.
 */
export type OrgProject = ProjectListResponse.Data;

/**
 * Response from GET /api/v3.1/org/project/list.
 */
export type OrgProjectListResponse = ProjectListResponse;

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
}

export interface OrganizationListResponse {
  readonly data: ReadonlyArray<OrganizationSummary>;
  readonly total_items: number;
}

export interface OrganizationProjectSummary {
  readonly id: string;
  readonly name: string;
}

export interface OrganizationProjectListResponse {
  readonly data: ReadonlyArray<OrganizationProjectSummary>;
  readonly total_items: number;
}

export type ConsumerProjectResolveResponse = ProjectResolveResponse;
export type ConsumerConnectedToolkitsResponse = ConsumerListConnectedToolkitsResponse;

export interface TriggerInstancesListActiveParams {
  user_ids?: string[];
  connected_account_ids?: string[];
  auth_config_ids?: string[];
  trigger_ids?: string[];
  trigger_names?: string[];
  show_disabled?: boolean;
  limit?: number;
}

export interface TriggerInstanceUpsertParams {
  connected_account_id?: string;
  trigger_config?: Record<string, unknown>;
}

/**
 * Client singleton
 */

const normalizeApiKey = (rawApiKey?: string): string | undefined =>
  typeof rawApiKey === 'string' && rawApiKey.trim().length > 0 ? rawApiKey : undefined;

const detectCliRuntime = (): string => {
  if (typeof Bun !== 'undefined') {
    return 'BUN';
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'NODEJS';
  }

  return 'UNKNOWN';
};

const buildDefaultHeaders = (params: {
  userApiKey?: string;
  orgId?: string;
  projectId?: string;
  cliSessionId?: string;
}): Record<string, string> | undefined => {
  const defaultHeaders = {
    'x-framework': 'cli',
    'x-source': 'CLI',
    'x-runtime': detectCliRuntime(),
    'x-sdk-version': constants.APP_VERSION,
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
  readonly get: () => Effect.Effect<
    _RawComposioClient,
    ComposioClientConfigurationError | NoSuchElementError
  >;
  readonly getFor: (params: {
    userApiKey?: string;
    orgId?: string;
    projectId?: string;
  }) => Effect.Effect<_RawComposioClient, ComposioClientConfigurationError | NoSuchElementError>;
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
 * a raw (uneffectful, Promise-based) Composio client instance.
 *
 * Clients are built with `Composio.fromEnv({}, ...)` so the ambient process
 * environment is never consulted: every credential and the base URL come from
 * the CLI's own configuration. Custom HTTP base URLs remain supported. The user key is
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
  const cache = new Map<string, _RawComposioClient>();

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
          // An empty environment prevents implicit env reads, including COMPOSIO_CUSTOM_HEADERS.
          _RawComposioClient.fromEnv(
            {},
            {
              apiKey: null,
              userApiKey: apiKey ?? null,
              orgApiKey: null,
              baseURL: ctx.data.baseURL,
              // Preserve support for explicitly configured HTTP backends.
              allowInsecureHTTP: true,
              logLevel: 'off',
              defaultHeaders: buildDefaultHeaders({
                userApiKey: apiKey,
                orgId: params?.orgId,
                projectId: params?.projectId,
                cliSessionId,
              }),
              fetch: metrics.fetch,
            }
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
 * Account, session-info, and consumer helpers
 *
 * Standalone functions rather than repository methods: they take explicit
 * credentials and scope, and callers already run inside layers that provide
 * `ComposioClientSingleton`.
 */

const orgScopedOptions = (orgId: string | undefined): RequestOptions | undefined =>
  orgId ? { headers: { 'x-org-id': orgId } } : undefined;

/**
 * Lists organizations available to the current user API key.
 */
export const listOrganizations = (params: {
  apiKey: string;
  limit?: number;
}): Effect.Effect<OrganizationListResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const response = yield* request(clientSingleton.getFor({ userApiKey: params.apiKey }), client =>
      client.org.list({ limit: params.limit ?? 50 })
    );
    const organizations = response.organizations.map(
      (organization: OrgListResponse.Organization) =>
        ({ id: organization.id, name: organization.name }) satisfies OrganizationSummary
    );

    return {
      data: organizations,
      total_items: organizations.length,
    };
  });

/**
 * Lists projects for a specific organization.
 */
export const listOrganizationProjects = (params: {
  apiKey: string;
  orgId: string;
  limit?: number;
}): Effect.Effect<OrganizationProjectListResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const response = yield* request(clientSingleton.getFor({ userApiKey: params.apiKey }), client =>
      client.org.project.list({ limit: params.limit ?? 50 }, orgScopedOptions(params.orgId))
    );
    const projects = response.data.map(
      (project: OrgProject) =>
        ({ id: project.id, name: project.name }) satisfies OrganizationProjectSummary
    );

    return {
      data: projects,
      total_items: projects.length,
    };
  });

/**
 * Lists all projects for the logged-in user's organization.
 *
 * @param params.apiKey     - UAK (sent as `x-user-api-key`)
 * @param params.orgId      - Organization ID (sent as `x-org-id`)
 * @param params.limit      - Max projects to return (default 50)
 */
export const listOrgProjects = (params: {
  apiKey: string;
  orgId: string;
  limit?: number;
}): Effect.Effect<OrgProjectListResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    return yield* request(clientSingleton.getFor({ userApiKey: params.apiKey }), client =>
      client.org.project.list(
        { list_all_org_projects: true, limit: params.limit ?? 50 },
        orgScopedOptions(params.orgId)
      )
    );
  });

/**
 * Calls GET /api/v3.1/auth/session/info with the full layered auth headers.
 */
export const getSessionInfo = (params: {
  apiKey: string;
  orgId: string;
  projectId: string;
}): Effect.Effect<SessionInfoResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const info = yield* request(
      clientSingleton.getFor({
        userApiKey: params.apiKey,
        orgId: params.orgId,
        projectId: params.projectId,
      }),
      client => client.auth.session.retrieveInfo()
    );
    return yield* requireSessionProject(info);
  });

/**
 * Calls GET /api/v3.1/auth/session/info using the x-user-api-key header.
 * Unlike getSessionInfo which requires both org AND project IDs, this variant
 * resolves session metadata from the UAK alone — useful during login before
 * org/project context is known.
 *
 * When `orgId` is provided, it is forwarded as `x-org-id` so the backend
 * resolves the session against the caller's currently-selected global org
 * (set via `composio orgs switch`). Without it, the backend falls back to the
 * API key's home org, which makes the response ignore any org switch.
 */
export const getSessionInfoByUserApiKey = (params: {
  userApiKey: string;
  orgId?: string;
}): Effect.Effect<SessionInfoResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const info = yield* request(clientSingleton.getFor({ userApiKey: params.userApiKey }), client =>
      client.auth.session.retrieveInfo(orgScopedOptions(params.orgId))
    );
    return yield* requireSessionProject(info);
  });

// The create-api-key response shape is not documented in the client. Walk the
// body for the first `uak_`/`ak_`-prefixed string under a key-like name.
const getApiKeyFromPayload = (payload: unknown): string | undefined => {
  const candidates = new Set<string>(['api_key', 'apiKey', 'key', 'token']);
  const keyPrefixes = ['uak_', 'ak_'];
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const entries = Object.entries(current as Record<string, unknown>);
    for (const [key, value] of entries) {
      if (
        typeof value === 'string' &&
        candidates.has(key) &&
        keyPrefixes.some(prefix => value.startsWith(prefix))
      ) {
        return value;
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return undefined;
};

/**
 * Mints a project API key. Never retried: a retry after a timed-out create
 * would mint a second key the caller never sees.
 */
export const createProjectApiKey = (params: {
  apiKey: string;
  orgId: string;
  projectId: string;
  name: string;
}): Effect.Effect<string, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const payload = yield* request(
      clientSingleton.getFor({
        userApiKey: params.apiKey,
        orgId: params.orgId,
        projectId: params.projectId,
      }),
      client =>
        client.post<unknown>(`/api/v3/org/project/${params.projectId}/api_keys/create`, {
          body: { name: params.name },
          maxRetries: 0,
        })
    );
    const createdApiKey = getApiKeyFromPayload(payload);

    if (!createdApiKey) {
      return yield* Effect.fail(
        new HttpDecodingError({
          cause: 'Create API key response did not contain an API key',
        })
      );
    }

    return createdApiKey;
  });

export const resolveConsumerProject = (params: {
  apiKey: string;
  orgId: string;
}): Effect.Effect<ConsumerProjectResolveResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    return yield* request(clientSingleton.getFor({ userApiKey: params.apiKey }), client =>
      client.org.consumer.project.resolve({
        'x-user-api-key': params.apiKey,
        'x-org-id': params.orgId,
      })
    );
  });

/**
 * Resolves the latest version of a tool. When `projectApiKey` is given the
 * request carries `x-api-key` instead of the user key, so exactly one
 * credential is sent.
 */
export const getLatestToolVersion = (params: {
  apiKey: string;
  toolSlug: string;
  orgId?: string;
  projectId?: string;
  projectApiKey?: string;
}): Effect.Effect<LatestToolVersionResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const headers = {
      ...(params.projectApiKey
        ? { 'x-api-key': params.projectApiKey, 'x-user-api-key': null }
        : {}),
      ...(params.orgId ? { 'x-org-id': params.orgId } : {}),
      ...(params.projectId ? { 'x-project-id': params.projectId } : {}),
    };
    const payload = yield* request(
      clientSingleton.getFor({
        userApiKey: params.apiKey,
        orgId: params.orgId,
        projectId: params.projectId,
      }),
      client =>
        client.get<unknown>(
          `/api/v3/tools/${encodeURIComponent(params.toolSlug)}/get_latest_version`,
          { headers }
        )
    );
    return yield* decode(LatestToolVersionResponse)(payload);
  });

export const getConsumerConnectedToolkits = (params: {
  apiKey: string;
  orgId: string;
  consumerUserId: string;
}): Effect.Effect<ConsumerConnectedToolkitsResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    return yield* request(clientSingleton.getFor({ userApiKey: params.apiKey }), client =>
      client.org.consumer.listConnectedToolkits({
        user_id: params.consumerUserId,
        'x-user-api-key': params.apiKey,
        'x-org-id': params.orgId,
      })
    );
  });

export class DeveloperProjectNotFoundError extends Data.TaggedError(
  'services/DeveloperProjectNotFoundError'
)<{
  readonly orgId: string;
  readonly projectName: string;
}> {}

export class AmbiguousDeveloperProjectNameError extends Data.TaggedError(
  'services/AmbiguousDeveloperProjectNameError'
)<{
  readonly orgId: string;
  readonly projectName: string;
  readonly matches: ReadonlyArray<OrganizationProjectSummary>;
}> {}

export const findDeveloperProjectByName = (params: {
  apiKey: string;
  orgId: string;
  name: string;
  limit?: number;
}): Effect.Effect<
  OrganizationProjectSummary,
  DeveloperProjectNotFoundError | AmbiguousDeveloperProjectNameError | ClientError,
  ComposioClientSingleton
> =>
  Effect.gen(function* () {
    const projects = yield* listOrgProjects({
      apiKey: params.apiKey,
      orgId: params.orgId,
      limit: params.limit,
    });

    const normalizedName = String.toLowerCase(params.name.trim());
    const matches = projects.data.filter(
      project => String.toLowerCase(project.name) === normalizedName
    );

    if (matches.length === 0) {
      return yield* Effect.fail(
        new DeveloperProjectNotFoundError({
          orgId: params.orgId,
          projectName: params.name,
        })
      );
    }

    if (matches.length > 1) {
      return yield* Effect.fail(
        new AmbiguousDeveloperProjectNameError({
          orgId: params.orgId,
          projectName: params.name,
          matches,
        })
      );
    }

    return matches[0];
  });

/**
 * Repositories
 */

/**
 * Auth config, connected account, and trigger instance operations: single-page
 * CRUD with no catalog caching.
 */
const resourceOperations = (client: Effect.Effect<_RawComposioClient, ClientError>) => ({
  /**
   * Lists auth configs with optional filters. Returns a single page of results.
   * @param params - Search/filter parameters
   */
  listAuthConfigs: (params: {
    search?: string;
    toolkit_slug?: string;
    limit?: number;
    show_disabled?: boolean;
  }) =>
    request(client, c =>
      c.authConfigs.list({
        search: params.search,
        toolkit_slug: params.toolkit_slug,
        limit: params.limit,
        show_disabled: params.show_disabled ?? true,
      })
    ).pipe(Effect.flatMap(decode(AuthConfigListResponse))),
  /**
   * Retrieves detailed info about a single auth config by its nanoid.
   * @param nanoid - Auth config ID
   */
  getAuthConfig: (nanoid: string) =>
    request(client, c => c.authConfigs.retrieve(nanoid)).pipe(
      Effect.flatMap(decode(AuthConfigItem))
    ),
  /**
   * Creates a new auth config for a toolkit.
   * @param params - Create parameters (discriminated union: use_composio_managed_auth | use_custom_auth)
   */
  createAuthConfig: (params: AuthConfigCreateParams) =>
    request(client, c => c.authConfigs.create(params)).pipe(
      Effect.flatMap(decode(AuthConfigCreateResponse))
    ),
  /**
   * Soft-deletes an auth config by its nanoid.
   * @param nanoid - Auth config ID
   */
  deleteAuthConfig: (nanoid: string) => request(client, c => c.authConfigs.delete(nanoid)),
  /**
   * List connected accounts with optional filters. Returns a single page of results.
   * @param params - Search/filter parameters
   */
  listConnectedAccounts: (params: {
    toolkit_slugs?: string[];
    user_ids?: string[];
    statuses?: ConnectedAccountListParams['statuses'];
    limit?: number;
  }) =>
    request(client, c =>
      c.connectedAccounts.list({
        toolkit_slugs: params.toolkit_slugs,
        user_ids: params.user_ids,
        statuses: params.statuses,
        limit: params.limit,
      })
    ).pipe(Effect.flatMap(decode(ConnectedAccountListResponse))),
  /**
   * Retrieves detailed info about a single connected account by its nanoid.
   * @param nanoid - Connected account ID (e.g. "con_1a2b3c4d5e6f")
   */
  getConnectedAccount: (nanoid: string) =>
    request(client, c => c.connectedAccounts.retrieve(nanoid)).pipe(
      Effect.flatMap(decode(ConnectedAccountItem))
    ),
  /**
   * Soft-deletes a connected account by its nanoid.
   * @param nanoid - Connected account ID
   */
  deleteConnectedAccount: (nanoid: string) =>
    request(client, c => c.connectedAccounts.delete(nanoid)),
  /**
   * Creates a new authentication link session for connecting an external account.
   * @param params - auth_config_id and user_id
   */
  createConnectedAccountLink: (params: { auth_config_id: string; user_id: string }) =>
    request(client, c => c.link.create(params)),
  /**
   * Lists active trigger instances with optional filters.
   * Returns a single page of results.
   */
  listActiveTriggers: (params: TriggerInstancesListActiveParams) =>
    request(client, c =>
      c.triggerInstances.listActive({
        user_ids: params.user_ids,
        connected_account_ids: params.connected_account_ids,
        auth_config_ids: params.auth_config_ids,
        trigger_ids: params.trigger_ids,
        trigger_names: params.trigger_names,
        show_disabled: params.show_disabled,
        limit: params.limit,
      })
    ).pipe(
      Effect.flatMap(response =>
        decode(TriggerInstanceItems)(response.items).pipe(
          // `triggers status` prints `total_items` directly, so a response that
          // omits a count renders as a number rather than `undefined`.
          Effect.map(items => ({
            ...response,
            items,
            total_items: response.total_items ?? items.length,
            total_pages: response.total_pages ?? 1,
            current_page: response.current_page ?? 1,
            next_cursor: response.next_cursor ?? null,
          }))
        )
      )
    ),
  createTrigger: (triggerSlug: string, params?: TriggerInstanceUpsertParams) =>
    request(client, c => c.triggerInstances.upsert(triggerSlug, params)),
  enableTrigger: (triggerId: string) =>
    request(client, c => c.triggerInstances.manage.update(triggerId, { status: 'enable' })),
  disableTrigger: (triggerId: string) =>
    request(client, c => c.triggerInstances.manage.update(triggerId, { status: 'disable' })),
  deleteTrigger: (triggerId: string) =>
    request(client, c => c.triggerInstances.manage.delete(triggerId)),
});

const makeComposioToolkitsRepository = Effect.gen(function* () {
  const clientSingleton = yield* ComposioClientSingleton;
  const client = clientSingleton.get();

  const listToolkits = (managedBy?: 'project', scope?: ToolkitProjectScope) =>
    requestAll(scope ? clientSingleton.getFor(scope) : client, (c, { cursor, limit }, signal) =>
      c.toolkits.list({ cursor, limit, managed_by: managedBy }, { signal })
    ).pipe(Effect.flatMap(decode(Toolkits)), Effect.map(sortBySlug));

  const getToolkitDetailed = (slug: string) =>
    request(client, c => c.toolkits.retrieve(slug)).pipe(Effect.flatMap(decode(ToolkitDetailed)));

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
    requestAll(client, (c, { cursor, limit }, signal) =>
      c.tools.list({ ...query, cursor, limit }, { signal })
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
      request(client, c => c.tools.retrieveEnum()).pipe(Effect.flatMap(decode(ToolsAsEnums))),
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
      request(client, c => c.triggersTypes.retrieveEnum()).pipe(
        Effect.flatMap(decode(TriggerTypesAsEnums))
      ),
    /**
     * Retrieves detailed info about a single trigger type by slug.
     * @param slug - Trigger type slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")
     */
    getTriggerTypeDetailed: (slug: string) =>
      request(client, c => c.triggersTypes.retrieve(slug)).pipe(
        Effect.flatMap(decode(TriggerType))
      ),
    /**
     * Fetches trigger types with optional toolkit filtering.
     * When toolkitSlugs is provided, fetches all matching trigger types.
     * @param toolkitSlugs - Optional array of toolkit slugs to filter by
     */
    getTriggerTypes: (toolkitSlugs?: ReadonlyArray<string>) =>
      requestAll(client, (c, { cursor, limit }, signal) =>
        c.triggersTypes.list(
          {
            cursor,
            limit,
            toolkit_slugs: toolkitSlugs ? [...toolkitSlugs] : undefined,
          },
          { signal }
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
     * Searches toolkits with optional filters. Returns a single page of results.
     * @param params - Search/filter parameters
     */
    searchToolkits: (params: {
      search?: string;
      category?: string;
      limit?: number;
      cursor?: string;
    }): Effect.Effect<ToolkitSearchResult, ClientError> =>
      request(client, c =>
        c.toolkits.list({
          search: params.search,
          category: params.category,
          limit: params.limit,
          cursor: params.cursor,
        })
      ).pipe(
        Effect.flatMap(response =>
          decode(Toolkits)(response.items).pipe(
            Effect.map(
              items =>
                ({
                  items,
                  total_items: response.total_items,
                  total_pages: response.total_pages,
                  next_cursor: response.next_cursor ?? null,
                }) satisfies ToolkitSearchResult
            )
          )
        )
      ),
    /**
     * Retrieves detailed toolkit info including auth_config_details.
     * @param slug - Toolkit slug
     */
    getToolkitDetailed,
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
    }) =>
      request(client, c =>
        c.tools.list({
          search: params.search,
          toolkit_slug: params.toolkit_slug,
          tags: params.tags ? params.tags.split(',').map(t => t.trim()) : undefined,
          limit: params.limit,
          cursor: params.cursor,
          toolkit_versions: 'latest',
        })
      ),
    /**
     * Retrieves detailed info about a single tool by slug.
     * @param slug - Tool slug (e.g. "GMAIL_SEND_EMAIL")
     */
    getToolDetailed: (slug: string) =>
      request(client, c => c.tools.retrieve(slug, { toolkit_versions: 'latest' })),
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
      request(client, c => c.cli.createSession({ scope: params?.scope ?? 'user' })).pipe(
        Effect.flatMap(decode(Session))
      ),
    /**
     * Retrieves the current state of a CLI session using either the session ID (UUID) or the 6-character code.
     */
    getSession: (session: { id: string }) =>
      request(client, c => c.cli.getSession({ id: session.id })).pipe(
        Effect.flatMap(decode(RetrievedSession))
      ),
    getRealtimeCredentials: () => request(client, c => c.cli.realtime.credentials()),
    authRealtimeChannel: (params: { channel_name: string; socket_id: string }) =>
      request(client, c => c.cli.realtime.auth(params)),
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
