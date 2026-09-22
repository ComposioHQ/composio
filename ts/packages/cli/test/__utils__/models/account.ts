import type { SessionRetrieveInfoResponse } from '@composio/client/resources/auth';
import type { OrgProject } from 'src/services/composio-clients';

export const TIMESTAMP = '2026-01-01T00:00:00.000Z';

/**
 * A complete `GET /api/v3.1/auth/session/info` response. Suites override only
 * the fields their scenario is about.
 */
export const makeSessionInfo = (
  params: {
    readonly orgId?: string;
    readonly orgName?: string;
    readonly projectId?: string;
    readonly projectNanoId?: string;
    readonly projectName?: string;
    readonly orgMemberId?: string;
    readonly userId?: string;
    readonly email?: string;
    readonly name?: string;
    readonly apiKey?: string;
  } = {}
): SessionRetrieveInfoResponse => {
  const orgId = params.orgId ?? 'org_default';
  const projectId = params.projectId ?? 'project_id_default';
  return {
    project: {
      auto_id: 1,
      id: projectId,
      org_id: orgId,
      name: params.projectName ?? 'Default Project',
      email: 'project@example.com',
      nano_id: params.projectNanoId ?? 'project_default',
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      webhook_url: null,
      event_webhook_url: null,
      webhook_secret: null,
      triggers_enabled: true,
      last_subscribed_at: null,
      deleted: false,
      is_new_webhook: false,
      webhook_version: 'V3',
      org: { id: orgId, name: params.orgName ?? 'Example Org', plan: 'enterprise' },
    },
    api_key:
      params.apiKey === undefined
        ? null
        : {
            auto_id: 1,
            id: 'api_key_id',
            name: 'CLI key',
            project_id: projectId,
            org_member_id: params.orgMemberId ?? 'member_default',
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
            deleted_at: null,
            key: params.apiKey,
            deleted: false,
          },
    org_member: {
      id: params.orgMemberId ?? 'member_default',
      email: params.email ?? 'cli@example.com',
      name: params.name ?? 'CLI User',
      role: 'admin',
      metadata: {},
      // Sent by the backend although the v3.1 spec omits it.
      ...(params.userId === undefined ? {} : { user_id: params.userId }),
    },
  };
};

/**
 * One entry of `GET /api/v3.1/org/project/list`.
 */
export const makeOrgProject = (params: {
  readonly id: string;
  readonly name: string;
  readonly orgId?: string;
}): OrgProject => ({
  id: params.id,
  org_id: params.orgId ?? 'org_default',
  name: params.name,
  email: 'project@example.com',
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  webhook_url: null,
  event_webhook_url: null,
  webhook_secret: null,
  webhook_version: 'V3',
  deleted: false,
});
