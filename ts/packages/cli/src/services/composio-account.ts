import { Data, Effect, String } from 'effect';
import type { RequestOptions } from '@composio/client/effect';
import type { OrgListResponse, ProjectListResponse } from '@composio/client/resources/org';
import type {
  ConsumerListConnectedToolkitsResponse,
  ProjectResolveResponse,
} from '@composio/client/resources/_internal/org/consumer';
import type { SessionRetrieveInfoResponse } from '@composio/client/resources/auth';
import { LatestToolVersionResponse } from 'src/models/tools';
import { ComposioClientSingleton } from './composio-clients';
import { HttpDecodingError, type ClientError } from './composio-errors';
import { decode, idempotent, validated } from './composio-request';

/**
 * Account, session-info, and consumer helpers
 *
 * Standalone functions rather than repository methods: they take explicit
 * credentials and scope, and callers already run inside layers that provide
 * `ComposioClientSingleton`.
 */

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

/** The org member's id. The persisted playground test user id derives from it. */
export const sessionUserIdOf = (info: SessionInfoResponse): string => info.org_member.id;

/** The project API key carried by a session, or null. */
export const sessionProjectApiKeyOf = (info: SessionInfoResponse): string | null =>
  info.api_key?.key ?? null;

/**
 * A single project entry returned by GET /api/v3.1/org/project/list.
 */
export type OrgProject = ProjectListResponse['data'][number];

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
}

interface OrganizationSummaryList {
  readonly data: ReadonlyArray<OrganizationSummary>;
  readonly total_items: number;
}

const orgScopedOptions = (orgId: string | undefined): RequestOptions | undefined =>
  orgId ? { headers: { 'x-org-id': orgId } } : undefined;

/**
 * Lists organizations available to the current user API key.
 */
export const listOrganizations = (params: {
  apiKey: string;
  limit?: number;
}): Effect.Effect<OrganizationSummaryList, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.getFor({ userApiKey: params.apiKey });
    const response = yield* client.org.list(
      { limit: params.limit ?? 50 },
      { ...idempotent, ...validated }
    );
    const organizations = response.organizations.map(
      (organization: OrgListResponse['organizations'][number]) =>
        ({ id: organization.id, name: organization.name }) satisfies OrganizationSummary
    );

    return {
      data: organizations,
      total_items: organizations.length,
    };
  });

/**
 * Lists projects for a specific organization.
 *
 * Project lists are not client-decoded: the CLI reads a project's ids, name,
 * and email, while the client schema also fixes `webhook_version` to the
 * versions it knew at generation time.
 */
export const listOrganizationProjects = (params: {
  apiKey: string;
  orgId: string;
  limit?: number;
}): Effect.Effect<OrganizationSummaryList, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.getFor({ userApiKey: params.apiKey });
    const response = yield* client.org.project.list(
      { limit: params.limit ?? 50 },
      { ...orgScopedOptions(params.orgId), ...idempotent }
    );
    const projects = response.data.map(
      (project: OrgProject) =>
        ({ id: project.id, name: project.name }) satisfies OrganizationSummary
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
}): Effect.Effect<ProjectListResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.getFor({ userApiKey: params.apiKey });
    return yield* client.org.project.list(
      { list_all_org_projects: true, limit: params.limit ?? 50 },
      { ...orgScopedOptions(params.orgId), ...idempotent }
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
    const client = yield* clientSingleton.getFor({
      userApiKey: params.apiKey,
      orgId: params.orgId,
      projectId: params.projectId,
    });
    // Read through a few fields only, and called after login has already
    // linked the session: drift in a field the CLI never reads must not fail it.
    const info = yield* client.auth.session.retrieveInfo(idempotent);
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
    const client = yield* clientSingleton.getFor({ userApiKey: params.userApiKey });
    const info = yield* client.auth.session.retrieveInfo({
      ...orgScopedOptions(params.orgId),
      ...idempotent,
    });
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
    const client = yield* clientSingleton.getFor({
      userApiKey: params.apiKey,
      orgId: params.orgId,
      projectId: params.projectId,
    });
    const payload = yield* client.post(`/api/v3/org/project/${params.projectId}/api_keys/create`, {
      body: { name: params.name },
    });
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
}): Effect.Effect<ProjectResolveResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.getFor({ userApiKey: params.apiKey });
    return yield* client._internal.org.consumer.project.resolve(
      {
        'x-user-api-key': params.apiKey,
        'x-org-id': params.orgId,
      },
      idempotent
    );
  });

/**
 * Resolves the latest version of a tool. When `projectApiKey` is given the
 * request is sent by a client that authenticates with it instead of the user
 * key, so exactly one credential is sent.
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
    const credential = params.projectApiKey
      ? { projectApiKey: params.projectApiKey }
      : { userApiKey: params.apiKey };
    // A client's scope names the org and the project together; when only one
    // of them is known it goes on the request, which an unscoped client allows.
    const client = yield* clientSingleton.getFor(
      params.orgId && params.projectId
        ? { ...credential, orgId: params.orgId, projectId: params.projectId }
        : credential
    );
    const headers =
      params.orgId && params.projectId
        ? undefined
        : {
            ...(params.orgId ? { 'x-org-id': params.orgId } : {}),
            ...(params.projectId ? { 'x-project-id': params.projectId } : {}),
          };
    const payload = yield* client.get(
      `/api/v3/tools/${encodeURIComponent(params.toolSlug)}/get_latest_version`,
      { headers, ...idempotent }
    );
    return yield* decode(LatestToolVersionResponse)(payload);
  });

export const getConsumerConnectedToolkits = (params: {
  apiKey: string;
  orgId: string;
  consumerUserId: string;
}): Effect.Effect<ConsumerListConnectedToolkitsResponse, ClientError, ComposioClientSingleton> =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.getFor({ userApiKey: params.apiKey });
    return yield* client._internal.org.consumer.listConnectedToolkits(
      {
        user_id: params.consumerUserId,
        'x-user-api-key': params.apiKey,
        'x-org-id': params.orgId,
      },
      { ...idempotent, ...validated }
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
  readonly matches: ReadonlyArray<OrganizationSummary>;
}> {}

export const findDeveloperProjectByName = (params: {
  apiKey: string;
  orgId: string;
  name: string;
  limit?: number;
}): Effect.Effect<
  OrganizationSummary,
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
