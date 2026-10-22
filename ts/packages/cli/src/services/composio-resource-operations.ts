import { Effect } from 'effect';
import type { ComposioClientShape } from '@composio/client/effect';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import type {
  TriggerInstanceListActiveParams,
  TriggerInstanceUpsertParams,
} from '@composio/client/resources/trigger-instances';
import {
  AuthConfigCreateResponse,
  AuthConfigItem,
  AuthConfigListResponse,
} from 'src/models/auth-configs';
import { ConnectedAccountItem } from 'src/models/connected-accounts';
import { Toolkits, type ToolkitSearchResult } from 'src/models/toolkits';
import { TriggerInstanceItems } from 'src/models/triggers';
import { TriggerType } from 'src/models/trigger-types';
import type { ClientError } from './composio-errors';
import { decode, idempotent } from './composio-request';

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
          idempotent
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
      Effect.flatMap(c => c.authConfigs.retrieve(nanoid, idempotent)),
      Effect.flatMap(decode(AuthConfigItem))
    ),
  /**
   * Creates a new auth config for a toolkit.
   * @param params - Create parameters (discriminated union: use_composio_managed_auth | use_custom_auth)
   */
  createAuthConfig: (params: AuthConfigCreateParams) =>
    client.pipe(
      Effect.flatMap(c => c.authConfigs.create(params)),
      Effect.flatMap(decode(AuthConfigCreateResponse))
    ),
  /**
   * Retrieves detailed info about a single connected account by its nanoid.
   * @param nanoid - Connected account ID (e.g. "con_1a2b3c4d5e6f")
   */
  getConnectedAccount: (nanoid: string) =>
    client.pipe(
      Effect.flatMap(c => c.connectedAccounts.retrieve(nanoid, idempotent)),
      Effect.flatMap(decode(ConnectedAccountItem))
    ),
  /**
   * Lists active trigger instances with optional filters.
   * Returns a single page of results.
   */
  listActiveTriggers: (params: TriggerInstanceListActiveParams) =>
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
          idempotent
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
    Effect.flatMap(client, c => c.triggerInstances.upsert(triggerSlug, params)),
  enableTrigger: (triggerId: string) =>
    Effect.flatMap(client, c => c.triggerInstances.manage.update(triggerId, { status: 'enable' })),
  disableTrigger: (triggerId: string) =>
    Effect.flatMap(client, c => c.triggerInstances.manage.update(triggerId, { status: 'disable' })),
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
        idempotent
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
   *
   * Not client-decoded: `tools list` prints the slug, name, and description of
   * each item and `tools info` suggests slugs from them, so drift in any other
   * field of a tool must not fail the listing.
   */
  searchTools: (params: {
    search?: string;
    toolkit_slug?: string;
    tags?: string;
    limit?: number;
    cursor?: string;
  }) =>
    Effect.flatMap(client, c =>
      c.tools.list(
        {
          search: params.search,
          toolkit_slug: params.toolkit_slug,
          tags: params.tags ? params.tags.split(',').map(t => t.trim()) : undefined,
          limit: params.limit,
          cursor: params.cursor,
          toolkit_versions: 'latest',
        },
        idempotent
      )
    ),
  /**
   * Retrieves detailed info about a single tool by slug.
   * @param slug - Tool slug (e.g. "GMAIL_SEND_EMAIL")
   *
   * Not validated by the client: `execute` treats a failed lookup as "no cached
   * definition" and would skip input validation and file uploads on drift
   * in a field it never reads.
   */
  getToolDetailed: (slug: string) =>
    Effect.flatMap(client, c => c.tools.retrieve(slug, { toolkit_versions: 'latest' }, idempotent)),
  /**
   * Retrieves detailed info about a single trigger type by slug.
   * @param slug - Trigger type slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")
   */
  getTriggerTypeDetailed: (slug: string) =>
    client.pipe(
      Effect.flatMap(c => c.triggersTypes.retrieve(slug, undefined, idempotent)),
      Effect.flatMap(decode(TriggerType))
    ),
});
