import { APIConnectionError, type RequestOptions } from '@composio/client/effect';
import type { SessionRetrieveInfoResponse } from '@composio/client/resources/auth';
import type { OrganizationSummary, OrgProject } from 'src/services/composio-account';
import { TIMESTAMP } from '../models/account';

/**
 * The credentials and scope one mock-client request carries: the parameters
 * the client was obtained with, overridden by per-request headers.
 */
export interface MockRequestScope {
  readonly userApiKey?: string;
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
  sessionInfo?:
    SessionRetrieveInfoResponse | ((scope: MockRequestScope) => SessionRetrieveInfoResponse);
  organizations?: ReadonlyArray<OrganizationSummary>;
  projects?: ReadonlyArray<OrgProject>;
  connectedToolkits?: ReadonlyArray<string>;
  latestToolVersion?: { readonly tool_slug: string; readonly version: string };
  projectApiKey?: string;
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

const scopeOf = (base: MockRequestScope, options?: RequestOptions): MockRequestScope => {
  // The CLI only ever passes plain header records.
  const headers = (options?.headers ?? {}) as Record<string, string | null | undefined>;
  const userApiKey = headers['x-user-api-key'];
  return {
    userApiKey: userApiKey === null ? undefined : (userApiKey ?? base.userApiKey),
    apiKey: headers['x-api-key'] ?? undefined,
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
      list: async (query?: { limit?: number } | null, options?: RequestOptions) => {
        record('org.list', options, query);
        if (!accountData.organizations) throw noTestData('org.list');
        const organizations = accountData.organizations.map(org => ({ ...org, ...timestamps }));
        return {
          organizations,
          next_cursor: null,
          total_pages: 1,
          current_page: 1,
          total_items: organizations.length,
        };
      },
      project: {
        list: async (
          query?: { limit?: number; list_all_org_projects?: boolean | null } | null,
          options?: RequestOptions
        ) => {
          record('org.project.list', options, query);
          if (!accountData.projects) throw noTestData('org.project.list');
          return {
            data: [...accountData.projects],
            next_cursor: null,
            total_pages: 1,
            current_page: 1,
            total_items: accountData.projects.length,
          };
        },
      },
      consumer: {
        project: {
          resolve: async (
            params: { 'x-user-api-key': string; 'x-org-id': string },
            options?: RequestOptions
          ) => {
            record('org.consumer.project.resolve', options, params);
            const orgId = params['x-org-id'];
            return {
              project_id: 'consumer_project_id_test',
              project_nano_id: 'consumer_project_test',
              project_name: 'Consumer Project',
              org_id: orgId,
              project_type: 'CONSUMER' as const,
              config: { consumer_experience_enabled: true, enhanced_controls: false },
              consumer_user_id: `consumer-user-${orgId}`,
            };
          },
        },
        listConnectedToolkits: async (
          params: { user_id: string; 'x-user-api-key': string; 'x-org-id': string },
          options?: RequestOptions
        ) => {
          record('org.consumer.listConnectedToolkits', options, params);
          if (!accountData.connectedToolkits) {
            throw noTestData('org.consumer.listConnectedToolkits');
          }
          return { toolkits: [...accountData.connectedToolkits] };
        },
      },
    },
    auth: {
      session: {
        retrieveInfo: async (options?: RequestOptions) => {
          const scope = record('auth.session.retrieveInfo', options);
          const sessionInfo = accountData.sessionInfo;
          if (sessionInfo === undefined) throw noTestData('auth.session.retrieveInfo');
          return typeof sessionInfo === 'function' ? sessionInfo(scope) : sessionInfo;
        },
      },
    },
    get: async (path: string, options?: RequestOptions) => {
      if (/^\/api\/v3\/tools\/[^/]+\/get_latest_version$/.test(path)) {
        record('tools.getLatestVersion', options, { path });
        if (!accountData.latestToolVersion) throw noTestData('tools.getLatestVersion');
        return accountData.latestToolVersion;
      }
      throw new Error(`Unhandled GET path "${path}"`);
    },
    post: async (path: string, options?: RequestOptions & { body?: unknown }) => {
      if (/^\/api\/v3\/org\/project\/[^/]+\/api_keys\/create$/.test(path)) {
        record('org.project.createApiKey', options, { path, body: options?.body });
        if (!accountData.projectApiKey) throw noTestData('org.project.createApiKey');
        return { api_key: accountData.projectApiKey };
      }
      throw new Error(`Unhandled POST path "${path}"`);
    },
  };
};
