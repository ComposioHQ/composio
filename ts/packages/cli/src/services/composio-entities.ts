import { Composio as RawComposioClient } from '@composio/client';
import { Data, Effect, Option } from 'effect';
import { ComposioUserContext, ComposioUserContextLive } from './user-context';

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

function asString(input: unknown): string | null {
  return typeof input === 'string' ? input : null;
}

function asNumber(input: unknown): number | null {
  return typeof input === 'number' ? input : null;
}

function asArray(input: unknown): ReadonlyArray<unknown> {
  return Array.isArray(input) ? input : [];
}

export interface PaginatedRecordsResponse {
  readonly items: ReadonlyArray<Record<string, unknown>>;
  readonly nextCursor: string | null;
  readonly totalPages: number;
  readonly currentPage: number | null;
  readonly totalItems: number | null;
}

function normalizePaginatedResponse(payload: unknown): PaginatedRecordsResponse {
  const raw = asRecord(payload);
  if (raw === null) {
    return {
      items: [],
      nextCursor: null,
      totalPages: 0,
      currentPage: null,
      totalItems: null,
    };
  }

  const itemRecords = asArray(raw['items'])
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => item !== null);

  return {
    items: itemRecords,
    nextCursor: asString(raw['next_cursor']),
    totalPages: asNumber(raw['total_pages']) ?? 0,
    currentPage: asNumber(raw['current_page']),
    totalItems: asNumber(raw['total_items']),
  };
}

export class ComposioEntitiesError extends Data.TaggedError('services/ComposioEntitiesError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

type ApiCall = <A>(f: (client: RawComposioClient) => Promise<A>) => Effect.Effect<A, Error>;

function createToolRouterEntityMethods(call: ApiCall) {
  return {
    toolRouterSessionCreate: (body: {
      readonly user_id: string;
      readonly toolkits?: {
        readonly enable?: ReadonlyArray<string>;
        readonly disable?: ReadonlyArray<string>;
      };
      readonly tools?: Record<
        string,
        {
          readonly enable?: ReadonlyArray<string>;
          readonly disable?: ReadonlyArray<string>;
        }
      >;
      readonly manage_connections?: {
        readonly enable?: boolean;
        readonly callback_url?: string;
        readonly enable_wait_for_connections?: boolean;
      };
      readonly auth_configs?: Record<string, string>;
      readonly connected_accounts?: Record<string, string>;
    }) =>
      call(client => client.toolRouter.session.create(body as never)).pipe(
        Effect.map(payload => asRecord(payload) ?? {})
      ),

    toolRouterSessionLink: (
      sessionId: string,
      body: {
        readonly toolkit: string;
        readonly callback_url?: string;
      }
    ) =>
      call(client => client.toolRouter.session.link(sessionId, body as never)).pipe(
        Effect.map(payload => asRecord(payload) ?? {})
      ),
  } as const;
}

export class ComposioEntitiesRepository extends Effect.Service<ComposioEntitiesRepository>()(
  'services/ComposioEntitiesRepository',
  {
    effect: Effect.gen(function* () {
      const ctx = yield* ComposioUserContext;
      let rawClient = Option.none<RawComposioClient>();

      const getClient = Effect.sync(() => {
        if (Option.isSome(rawClient)) {
          return rawClient.value;
        }

        const client = new RawComposioClient({
          apiKey: ctx.data.apiKey.pipe(Option.getOrUndefined),
          baseURL: ctx.data.baseURL,
        });

        rawClient = Option.some(client);
        return client;
      });

      const call = <A>(f: (client: RawComposioClient) => Promise<A>): Effect.Effect<A, Error> =>
        Effect.gen(function* () {
          const client = yield* getClient;
          return yield* Effect.tryPromise({
            try: () => f(client),
            catch: cause =>
              new ComposioEntitiesError({
                message: 'Failed to call Composio API',
                cause,
              }),
          });
        });

      return {
        toolsList: (query: {
          readonly toolkit_slug?: string;
          readonly tool_slugs?: string;
          readonly auth_config_ids?: ReadonlyArray<string>;
          readonly important?: 'true' | 'false';
          readonly tags?: ReadonlyArray<string>;
          readonly scopes?: ReadonlyArray<string>;
          readonly search?: string;
          readonly include_deprecated?: boolean;
          readonly toolkit_versions?: string | Record<string, string>;
          readonly limit?: number;
          readonly cursor?: string;
        }) =>
          call(client => client.tools.list(query as never)).pipe(
            Effect.map(normalizePaginatedResponse)
          ),

        toolsRetrieve: (
          toolSlug: string,
          query?: {
            readonly version?: string;
            readonly toolkit_versions?: string | Record<string, string>;
          }
        ) =>
          call(client => client.tools.retrieve(toolSlug, query)).pipe(
            Effect.map(payload => asRecord(payload) ?? {})
          ),

        toolsExecute: (
          toolSlug: string,
          body: {
            readonly connected_account_id?: string;
            readonly user_id?: string;
            readonly version?: string;
            readonly arguments?: Record<string, unknown>;
            readonly text?: string;
            readonly allow_tracing?: boolean;
            readonly custom_auth_params?: Record<string, unknown>;
            readonly custom_connection_data?: Record<string, unknown>;
          }
        ) => call(client => client.tools.execute(toolSlug, body as never)),

        toolsProxy: (body: {
          readonly endpoint: string;
          readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
          readonly connected_account_id?: string;
          readonly body?: unknown;
          readonly parameters?: ReadonlyArray<{
            readonly in: 'query' | 'header';
            readonly name: string;
            readonly value: string | number;
          }>;
        }) =>
          call(client =>
            client.tools.proxy({
              endpoint: body.endpoint,
              method: body.method,
              connected_account_id: body.connected_account_id,
              body: body.body,
              parameters: (body.parameters ?? []).map(parameter => ({
                name: parameter.name,
                type: parameter.in,
                value: String(parameter.value),
              })),
            })
          ),

        toolkitsList: (query: {
          readonly category?: string;
          readonly managed_by?: 'composio' | 'all' | 'project';
          readonly sort_by?: 'usage' | 'alphabetically';
          readonly include_deprecated?: boolean;
          readonly search?: string;
          readonly limit?: number;
          readonly cursor?: string;
        }) =>
          call(client => client.toolkits.list(query)).pipe(Effect.map(normalizePaginatedResponse)),

        toolkitsRetrieve: (toolkitSlug: string, query?: { readonly version?: string }) =>
          call(client => client.toolkits.retrieve(toolkitSlug, query)).pipe(
            Effect.map(payload => asRecord(payload) ?? {})
          ),

        authConfigsList: (query: {
          readonly is_composio_managed?: string | boolean;
          readonly toolkit_slug?: string;
          readonly show_disabled?: boolean;
          readonly search?: string;
          readonly limit?: number;
          readonly cursor?: string;
        }) =>
          call(client => client.authConfigs.list(query)).pipe(
            Effect.map(normalizePaginatedResponse)
          ),

        authConfigsRetrieve: (authConfigId: string) =>
          call(client => client.authConfigs.retrieve(authConfigId)).pipe(
            Effect.map(payload => asRecord(payload) ?? {})
          ),

        authConfigsCreate: (body: {
          readonly toolkit: {
            readonly slug: string;
          };
          readonly auth_config:
            | {
                readonly type: 'use_composio_managed_auth';
                readonly name?: string;
                readonly credentials?: Record<string, unknown>;
                readonly is_enabled_for_tool_router?: boolean;
                readonly tool_access_config?: {
                  readonly tools_for_connected_account_creation?: ReadonlyArray<string>;
                };
              }
            | {
                readonly type: 'use_custom_auth';
                readonly name?: string;
                readonly authScheme: string;
                readonly credentials?: Record<string, unknown>;
                readonly is_enabled_for_tool_router?: boolean;
                readonly tool_access_config?: {
                  readonly tools_for_connected_account_creation?: ReadonlyArray<string>;
                };
              };
        }) => call(client => client.authConfigs.create(body as never)),

        authConfigsDelete: (authConfigId: string) =>
          call(client => client.authConfigs.delete(authConfigId)),

        connectedAccountsList: (query: {
          readonly toolkit_slugs?: ReadonlyArray<string>;
          readonly statuses?: ReadonlyArray<string>;
          readonly cursor?: string;
          readonly limit?: number;
          readonly user_ids?: ReadonlyArray<string>;
          readonly auth_config_ids?: ReadonlyArray<string>;
          readonly connected_account_ids?: ReadonlyArray<string>;
          readonly order_by?: 'created_at' | 'updated_at';
          readonly order_direction?: 'asc' | 'desc';
        }) =>
          call(client => client.connectedAccounts.list(query as never)).pipe(
            Effect.map(normalizePaginatedResponse)
          ),

        connectedAccountsRetrieve: (connectedAccountId: string) =>
          call(client => client.connectedAccounts.retrieve(connectedAccountId)).pipe(
            Effect.map(payload => asRecord(payload) ?? {})
          ),

        connectedAccountsDelete: (connectedAccountId: string) =>
          call(client => client.connectedAccounts.delete(connectedAccountId)),

        connectedAccountsLink: (body: {
          readonly auth_config_id: string;
          readonly user_id: string;
          readonly callback_url?: string;
        }) => call(client => client.link.create(body)),

        triggerTypesList: (query: {
          readonly toolkit_slugs?: ReadonlyArray<string>;
          readonly toolkit_versions?: string | Record<string, string>;
          readonly limit?: number;
          readonly cursor?: string;
        }) =>
          call(client => client.triggersTypes.list(query as never)).pipe(
            Effect.map(normalizePaginatedResponse)
          ),

        triggerTypesRetrieve: (
          triggerSlug: string,
          query?: {
            readonly toolkit_versions?: string | Record<string, string>;
          }
        ) =>
          call(client => client.triggersTypes.retrieve(triggerSlug, query)).pipe(
            Effect.map(payload => asRecord(payload) ?? {})
          ),

        triggerInstancesUpsert: (
          triggerSlug: string,
          body: {
            readonly connected_account_id: string;
            readonly trigger_config?: Record<string, unknown>;
            readonly toolkit_versions?: string | Record<string, string>;
          }
        ) => call(client => client.triggerInstances.upsert(triggerSlug, body)),

        triggerInstancesListActive: (query: {
          readonly user_ids?: ReadonlyArray<string>;
          readonly connected_account_ids?: ReadonlyArray<string>;
          readonly auth_config_ids?: ReadonlyArray<string>;
          readonly trigger_ids?: ReadonlyArray<string>;
          readonly trigger_names?: ReadonlyArray<string>;
          readonly show_disabled?: boolean;
          readonly limit?: number;
          readonly cursor?: string;
        }) =>
          call(client => client.triggerInstances.listActive(query as never)).pipe(
            Effect.map(normalizePaginatedResponse)
          ),

        triggerInstancesDelete: (triggerId: string) =>
          call(client => client.triggerInstances.manage.delete(triggerId)),

        triggerInstancesPatchStatus: (triggerId: string, status: 'enable' | 'disable') =>
          call(client => client.triggerInstances.manage.update(triggerId, { status })),

        ...createToolRouterEntityMethods(call),
      } as const;
    }),
    dependencies: [ComposioUserContextLive],
  }
) {}
