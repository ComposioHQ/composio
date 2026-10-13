import { Effect } from 'effect';
import type { ComposioClientShape } from '@composio/client/effect';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import type { ConnectedAccountListParams } from '@composio/client/resources/connected-accounts';
import {
  AuthConfigCreateResponse,
  AuthConfigItem,
  AuthConfigListResponse,
} from 'src/models/auth-configs';
import { ConnectedAccountItem, ConnectedAccountListResponse } from 'src/models/connected-accounts';
import { Toolkits, type ToolkitSearchResult } from 'src/models/toolkits';
import { TriggerInstanceItems } from 'src/models/triggers';
import { TriggerType } from 'src/models/trigger-types';
import type { ClientError } from './composio-errors';
import { decode, undecoded } from './composio-request';

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
 * Auth config, connected account, and trigger instance operations: single-page
 * CRUD with no catalog caching.
 */
export const resourceOperations = (client: Effect.Effect<ComposioClientShape, ClientError>) => ({
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
    client.pipe(
      Effect.flatMap(c =>
        c.authConfigs.list(
          {
            search: params.search,
            toolkit_slug: params.toolkit_slug,
            limit: params.limit,
            show_disabled: params.show_disabled ?? true,
          },
          undecoded
        )
      ),
      Effect.flatMap(decode(AuthConfigListResponse))
    ),
  /**
   * Retrieves detailed info about a single auth config by its nanoid.
   * @param nanoid - Auth config ID
   */
  getAuthConfig: (nanoid: string) =>
    client.pipe(
      Effect.flatMap(c => c.authConfigs.retrieve(nanoid, undecoded)),
      Effect.flatMap(decode(AuthConfigItem))
    ),
  /**
   * Creates a new auth config for a toolkit.
   * @param params - Create parameters (discriminated union: use_composio_managed_auth | use_custom_auth)
   */
  createAuthConfig: (params: AuthConfigCreateParams) =>
    client.pipe(
      Effect.flatMap(c => c.authConfigs.create(params, undecoded)),
      Effect.flatMap(decode(AuthConfigCreateResponse))
    ),
  /**
   * Soft-deletes an auth config by its nanoid.
   * @param nanoid - Auth config ID
   */
  deleteAuthConfig: (nanoid: string) =>
    Effect.flatMap(client, c => c.authConfigs.delete(nanoid, undefined, undecoded)),
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
    client.pipe(
      Effect.flatMap(c =>
        c.connectedAccounts.list(
          {
            toolkit_slugs: params.toolkit_slugs,
            user_ids: params.user_ids,
            statuses: params.statuses,
            limit: params.limit,
          },
          undecoded
        )
      ),
      Effect.flatMap(decode(ConnectedAccountListResponse))
    ),
  /**
   * Retrieves detailed info about a single connected account by its nanoid.
   * @param nanoid - Connected account ID (e.g. "con_1a2b3c4d5e6f")
   */
  getConnectedAccount: (nanoid: string) =>
    client.pipe(
      Effect.flatMap(c => c.connectedAccounts.retrieve(nanoid, undecoded)),
      Effect.flatMap(decode(ConnectedAccountItem))
    ),
  /**
   * Soft-deletes a connected account by its nanoid.
   * @param nanoid - Connected account ID
   */
  deleteConnectedAccount: (nanoid: string) =>
    Effect.flatMap(client, c => c.connectedAccounts.delete(nanoid, undefined, undecoded)),
  /**
   * Creates a new authentication link session for connecting an external account.
   * @param params - auth_config_id and user_id
   */
  createConnectedAccountLink: (params: { auth_config_id: string; user_id: string }) =>
    Effect.flatMap(client, c => c.link.create(params, undecoded)),
  /**
   * Lists active trigger instances with optional filters.
   * Returns a single page of results.
   */
  listActiveTriggers: (params: TriggerInstancesListActiveParams) =>
    client.pipe(
      Effect.flatMap(c =>
        c.triggerInstances.listActive(
          {
            user_ids: params.user_ids,
            connected_account_ids: params.connected_account_ids,
            auth_config_ids: params.auth_config_ids,
            trigger_ids: params.trigger_ids,
            trigger_names: params.trigger_names,
            show_disabled: params.show_disabled,
            limit: params.limit,
          },
          undecoded
        )
      ),
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
    Effect.flatMap(client, c => c.triggerInstances.upsert(triggerSlug, params, undecoded)),
  enableTrigger: (triggerId: string) =>
    Effect.flatMap(client, c =>
      c.triggerInstances.manage.update(triggerId, { status: 'enable' }, undecoded)
    ),
  disableTrigger: (triggerId: string) =>
    Effect.flatMap(client, c =>
      c.triggerInstances.manage.update(triggerId, { status: 'disable' }, undecoded)
    ),
  deleteTrigger: (triggerId: string) =>
    Effect.flatMap(client, c => c.triggerInstances.manage.delete(triggerId, undecoded)),
});

/**
 * Single-page searches and single-item lookups that sit outside the catalog
 * fetches: none of them is cached.
 */
export const lookupOperations = (client: Effect.Effect<ComposioClientShape, ClientError>) => ({
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
    Effect.flatMap(client, c =>
      c.toolkits.list(
        {
          search: params.search,
          category: params.category,
          limit: params.limit,
          cursor: params.cursor,
        },
        undecoded
      )
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
    Effect.flatMap(client, c =>
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
    Effect.flatMap(client, c => c.tools.retrieve(slug, { toolkit_versions: 'latest' })),
  /**
   * Retrieves detailed info about a single trigger type by slug.
   * @param slug - Trigger type slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")
   */
  getTriggerTypeDetailed: (slug: string) =>
    client.pipe(
      Effect.flatMap(c => c.triggersTypes.retrieve(slug, undefined, undecoded)),
      Effect.flatMap(decode(TriggerType))
    ),
});
