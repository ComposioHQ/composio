import { APIConnectionError, type RequestOptions } from '@composio/client/effect';
import type { SessionRetrieveInfoResponse } from '@composio/client/resources/auth';
import { Effect, Option } from 'effect';
import type { OrganizationSummary, OrgProject } from 'src/services/composio-account';
import { TIMESTAMP } from '../models/account';

/**
 * The credentials and scope one mock-client request carries: the parameters
 * the client was obtained with, and the org or project an unscoped client
 * names on the request itself.
 */
export interface MockRequestScope {
  readonly userApiKey?: string;
  /** The project key the client authenticates with, in place of a user key. */
  readonly apiKey?: string;
  readonly orgId?: string;
  readonly projectId?: string;
}

/**
 * One call to an account, session-info, or consumer endpoint of the mock client.
 */
export interface MockAccountRequest {
  readonly operation:
    | 'org.list'
    | 'org.project.list'
    | 'org.consumer.project.resolve'
    | 'org.consumer.listConnectedToolkits'
    | 'auth.session.retrieveInfo'
    | 'tools.getLatestVersion'
    | 'org.project.createApiKey'
    | 'org.consumer.config'
    | 'consumer.permissions.resolve';
  readonly scope: MockRequestScope;
  readonly params?: unknown;
  readonly options?: RequestOptions;
}

/**
 * Account, session-info, and consumer data served by the mock client's
 * `org.*` and `auth.session.retrieveInfo` resources and its `get`/`post`
 * escape hatch. An endpoint without data rejects with a connection error,
 * as an unreachable backend would; consumer project resolution always
 * answers, echoing the requested org.
 */
export interface AccountTestData {
  /** A function answers per scope; whatever it throws becomes the call's failure. */
  sessionInfo?:
    SessionRetrieveInfoResponse | ((scope: MockRequestScope) => SessionRetrieveInfoResponse);
  organizations?: ReadonlyArray<OrganizationSummary>;
  projects?: ReadonlyArray<OrgProject>;
  connectedToolkits?: ReadonlyArray<string>;
  latestToolVersion?: { readonly tool_slug: string; readonly version: string };
  projectApiKey?: string;
  /** The consumer project's `consumer_user_id`; `consumer-user-<org id>` by default. */
  consumerUserId?: string;
  onRequest?: (request: MockAccountRequest) => void;
}

const noTestData = (operation: MockAccountRequest['operation']) =>
  new APIConnectionError({
    message: `No test data for ${operation}`,
    method: 'GET',
    url: 'https://mock.invalid',
    reason: 'TransportError',
    description: `No test data for ${operation}`,
  });

/**
 * `value`, or the connection error an endpoint without test data rejects with.
 */
const withTestData = <A>(value: A | undefined, operation: MockAccountRequest['operation']) =>
  Effect.fromOption(Option.fromUndefinedOr(value), () => noTestData(operation));

const LATEST_TOOL_VERSION_PATH = /^\/api\/v3\/tools\/[^/]+\/get_latest_version$/;
const CREATE_PROJECT_API_KEY_PATH = /^\/api\/v3\/org\/project\/[^/]+\/api_keys\/create$/;

// The credential is the client's own; an unscoped client may still name the
// org or project on one request.
const scopeOf = (base: MockRequestScope, options?: RequestOptions): MockRequestScope => {
  // The CLI only ever passes plain header records.
  const headers = (options?.headers ?? {}) as Record<string, string | null | undefined>;
  return {
    userApiKey: base.userApiKey,
    apiKey: base.apiKey,
    orgId: headers['x-org-id'] ?? base.orgId,
    projectId: headers['x-project-id'] ?? base.projectId,
  };
};

/**
 * The account, session-info, and consumer resources of a mock client obtained
 * with `base`, answering from `accountData` and recording each call through
 * `accountData.onRequest`. Served per client scope, so a handler sees the
 * credentials and org or project the real client would have placed in its
 * default headers.
 */
export const mockAccountResources = (accountData: AccountTestData, base: MockRequestScope) => {
  const record = (
    operation: MockAccountRequest['operation'],
    options: RequestOptions | undefined,
    params?: unknown
  ): MockRequestScope => {
    const scope = scopeOf(base, options);
    accountData.onRequest?.({ operation, scope, params, options });
    return scope;
  };
  const timestamps = {
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };

  return {
    org: {
      list: (query?: { limit?: number } | null, options?: RequestOptions) => {
        record('org.list', options, query);
        return withTestData(accountData.organizations, 'org.list').pipe(
          Effect.map(organizations => organizations.map(org => ({ ...org, ...timestamps }))),
          Effect.map(organizations => ({
            organizations,
            next_cursor: null,
            total_pages: 1,
            current_page: 1,
            total_items: organizations.length,
          }))
        );
      },
      project: {
        list: (
          query?: { limit?: number; list_all_org_projects?: boolean | null } | null,
          options?: RequestOptions
        ) => {
          record('org.project.list', options, query);
          return withTestData(accountData.projects, 'org.project.list').pipe(
            Effect.map(projects => ({
              data: [...projects],
              next_cursor: null,
              total_pages: 1,
              current_page: 1,
              total_items: projects.length,
            }))
          );
        },
      },
    },
    _internal: {
      org: {
        consumer: {
          project: {
            resolve: (
              params: { 'x-user-api-key': string; 'x-org-id': string },
              options?: RequestOptions
            ) => {
              record('org.consumer.project.resolve', options, params);
              const orgId = params['x-org-id'];
              return Effect.succeed({
                project_id: 'consumer_project_id_test',
                project_nano_id: 'consumer_project_test',
                project_name: 'Consumer Project',
                org_id: orgId,
                project_type: 'CONSUMER' as const,
                config: { consumer_experience_enabled: true, enhanced_controls: false },
                consumer_user_id: accountData.consumerUserId ?? `consumer-user-${orgId}`,
              });
            },
          },
          listConnectedToolkits: (
            params: { user_id: string; 'x-user-api-key': string; 'x-org-id': string },
            options?: RequestOptions
          ) => {
            record('org.consumer.listConnectedToolkits', options, params);
            return withTestData(
              accountData.connectedToolkits,
              'org.consumer.listConnectedToolkits'
            ).pipe(Effect.map(toolkits => ({ toolkits: [...toolkits] })));
          },
        },
      },
    },
    auth: {
      session: {
        retrieveInfo: (options?: RequestOptions) => {
          const scope = record('auth.session.retrieveInfo', options);
          return withTestData(accountData.sessionInfo, 'auth.session.retrieveInfo').pipe(
            // A test fails the call by throwing from its callback.
            Effect.flatMap(sessionInfo =>
              Effect.try({
                try: () => (typeof sessionInfo === 'function' ? sessionInfo(scope) : sessionInfo),
                catch: cause => cause,
              })
            )
          );
        },
      },
    },
    get: (path: string, options?: RequestOptions) => {
      if (!LATEST_TOOL_VERSION_PATH.test(path)) {
        return Effect.fail(new Error(`Unhandled GET path "${path}"`));
      }
      record('tools.getLatestVersion', options, { path });
      return withTestData(accountData.latestToolVersion, 'tools.getLatestVersion');
    },
    post: (path: string, options?: RequestOptions & { body?: unknown }) => {
      if (!CREATE_PROJECT_API_KEY_PATH.test(path)) {
        return Effect.fail(new Error(`Unhandled POST path "${path}"`));
      }
      record('org.project.createApiKey', options, { path, body: options?.body });
      // An empty key counts as missing, as it always has.
      return withTestData(accountData.projectApiKey || undefined, 'org.project.createApiKey').pipe(
        Effect.map(apiKey => ({ api_key: apiKey }))
      );
    },
  };
};
