import { Data, Effect, Option } from 'effect';
import type { Composio } from '@composio/client';
import {
  getFreshConsumerToolRouterAuthConfigsFromCache,
  getFreshConsumerToolRouterConnectedAccountsFromCache,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import {
  resolveToolRouterSessionConnections,
  type ToolRouterSessionConnectionContext,
} from 'src/services/tool-router-session-connections';
import {
  ENHANCED_LINK_URL_OVERWRITE,
  getConsumerPermissionSnapshot,
  type ConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';

export interface CreateToolRouterSessionOptions {
  /** Enable auto connection management. Default: false. */
  readonly manageConnections?: boolean;
  /** Restrict session to these toolkit slugs. */
  readonly toolkits?: ReadonlyArray<string>;
  /** Consumer-only cache scope for rolling auth-config reuse. */
  readonly cacheScope?: {
    readonly orgId: string;
    readonly projectId: string;
    readonly consumerUserId: string;
  };
  /** Explicit connected-account pins by toolkit slug. */
  readonly connectedAccounts?: Record<string, string>;
  /** Toolkits whose connected-account pins should be omitted from the session. */
  readonly excludeConnectedAccountsForToolkits?: ReadonlyArray<string>;
  /** Enable Tool Router multi-account mode for this session. */
  readonly multiAccount?: {
    readonly enable?: boolean;
    readonly maxAccountsPerToolkit?: number;
    readonly requireExplicitSelection?: boolean;
  };
}

export interface CreatedToolRouterSession {
  readonly sessionId: string;
  readonly permissionSnapshot?: ConsumerPermissionSnapshot;
  readonly connectedAccounts?: Record<string, string>;
  readonly connectedAccountWordIds?: Record<string, string>;
}

export class ToolRouterSessionCreateError extends Data.TaggedError(
  'effects/ToolRouterSessionCreateError'
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Create an ephemeral Tool Router session for the given user ID.
 * Returns the session id plus the permission and connected-account context bound to it.
 *
 * Accepts a pre-resolved client instance (from ComposioClientSingleton)
 * so callers can resolve the dependency at layer construction time.
 * Used by `ToolsExecutorLive` which already holds the client reference.
 */
export const createToolRouterSessionContext = (
  client: Composio,
  userId: string,
  options?: CreateToolRouterSessionOptions
) =>
  Effect.gen(function* () {
    const mergeConnectedAccounts = (...mappings: Array<Record<string, string> | undefined>) => {
      const merged = Object.assign({}, ...mappings.filter(Boolean));
      return Object.keys(merged).length > 0 ? merged : undefined;
    };
    const requestedToolkits = options?.toolkits ?? [];
    const excludedToolkits = new Set(
      (options?.excludeConnectedAccountsForToolkits ?? []).map(toolkit => toolkit.toLowerCase())
    );
    const filterConnectedAccounts = (mapping: Record<string, string> | undefined) => {
      if (!mapping) return undefined;
      const filtered = Object.fromEntries(
        Object.entries(mapping).filter(([toolkit]) => !excludedToolkits.has(toolkit.toLowerCase()))
      );
      return Object.keys(filtered).length > 0 ? filtered : undefined;
    };
    const resolveConnectedAccountWordIds = (
      selected: Record<string, string> | undefined,
      available: ToolRouterSessionConnectionContext['availableConnectedAccounts']
    ) => {
      if (!selected || !available) return undefined;
      const wordIds = Object.fromEntries(
        Object.entries(selected).flatMap(([toolkit, connectedAccountId]) => {
          const account = available[toolkit.toLowerCase()]?.find(
            item => item.id === connectedAccountId
          );
          return account?.wordId ? [[toolkit, account.wordId]] : [];
        })
      );
      return Object.keys(wordIds).length > 0 ? wordIds : undefined;
    };

    const cachedAuthConfigs = options?.cacheScope
      ? yield* getFreshConsumerToolRouterAuthConfigsFromCache({
          orgId: options.cacheScope.orgId,
          consumerUserId: options.cacheScope.consumerUserId,
          toolkits: requestedToolkits.length > 0 ? requestedToolkits : undefined,
        })
      : Option.none();
    const cachedConnectedAccounts = options?.cacheScope
      ? yield* getFreshConsumerToolRouterConnectedAccountsFromCache({
          orgId: options.cacheScope.orgId,
          consumerUserId: options.cacheScope.consumerUserId,
          toolkits: requestedToolkits.length > 0 ? requestedToolkits : undefined,
        })
      : Option.none();

    const connectionContext = Option.isSome(cachedAuthConfigs)
      ? {
          connectedToolkits: requestedToolkits,
          authConfigs: cachedAuthConfigs.value.authConfigs,
          connectedAccounts: mergeConnectedAccounts(
            filterConnectedAccounts(
              Option.isSome(cachedConnectedAccounts)
                ? cachedConnectedAccounts.value.connectedAccounts
                : undefined
            ),
            options?.connectedAccounts
          ),
          availableConnectedAccounts: Option.isSome(cachedConnectedAccounts)
            ? cachedConnectedAccounts.value.availableConnectedAccounts
            : undefined,
        }
      : yield* resolveToolRouterSessionConnections(client, userId, {
          toolkits: requestedToolkits.length > 0 ? requestedToolkits : undefined,
        }).pipe(
          Effect.map(connectionContext => ({
            ...connectionContext,
            connectedAccounts: mergeConnectedAccounts(
              filterConnectedAccounts(connectionContext.connectedAccounts),
              options?.connectedAccounts
            ),
          }))
        );

    if (options?.cacheScope && Option.isNone(cachedAuthConfigs)) {
      yield* writeConsumerConnectedToolkitsCache({
        orgId: options.cacheScope.orgId,
        consumerUserId: options.cacheScope.consumerUserId,
        toolkits: connectionContext.connectedToolkits,
        toolRouterAuthConfigs: {
          authConfigs: connectionContext.authConfigs,
        },
        toolRouterConnectedAccounts: {
          connectedAccounts: connectionContext.connectedAccounts,
          availableConnectedAccounts: connectionContext.availableConnectedAccounts,
        },
      }).pipe(Effect.catch(() => Effect.void));
    }

    const connectedAccountIds = Object.values(connectionContext.connectedAccounts ?? {}).filter(
      (value): value is string => typeof value === 'string'
    );
    const permissionSnapshot = options?.cacheScope
      ? yield* getConsumerPermissionSnapshot({
          orgId: options.cacheScope.orgId,
          projectId: options.cacheScope.projectId,
          consumerUserId: options.cacheScope.consumerUserId,
          connectedAccountIds,
        })
      : undefined;
    return yield* Effect.tryPromise({
      try: () =>
        client.toolRouter.session.create({
          user_id: userId,
          auth_configs: connectionContext.authConfigs,
          connected_accounts: connectionContext.connectedAccounts,
          manage_connections: { enable: options?.manageConnections ?? false },
          multi_account: options?.multiAccount
            ? {
                enable: options.multiAccount.enable,
                max_accounts_per_toolkit: options.multiAccount.maxAccountsPerToolkit,
                require_explicit_selection: options.multiAccount.requireExplicitSelection,
              }
            : undefined,
          toolkits: requestedToolkits.length > 0 ? { enable: [...requestedToolkits] } : undefined,
          experimental: permissionSnapshot?.enhancedControlsEnabled
            ? { link_url_overwrite: ENHANCED_LINK_URL_OVERWRITE }
            : undefined,
        }),
      catch: cause =>
        new ToolRouterSessionCreateError({
          message: 'Failed to create a Tool Router session.',
          cause,
        }),
    }).pipe(
      Effect.map((session): CreatedToolRouterSession => ({
        sessionId: session.session_id,
        permissionSnapshot,
        connectedAccounts: connectionContext.connectedAccounts,
        connectedAccountWordIds: resolveConnectedAccountWordIds(
          connectionContext.connectedAccounts,
          connectionContext.availableConnectedAccounts
        ),
      }))
    );
  });

/** Backward-compatible helper for callers that only need the session id. */
export const createToolRouterSession = (
  client: Composio,
  userId: string,
  options?: CreateToolRouterSessionOptions
) =>
  createToolRouterSessionContext(client, userId, options).pipe(
    Effect.map(session => session.sessionId)
  );

/**
 * Resolve the Composio client and create a Tool Router session in one step.
 * Returns `{ client, sessionId }` — eliminates the 3-step boilerplate
 * (resolve singleton, get client, create session) repeated across commands.
 */
export const resolveToolRouterSession = (
  client: Composio,
  userId: string,
  options?: CreateToolRouterSessionOptions
) =>
  createToolRouterSessionContext(client, userId, options).pipe(
    Effect.map(session => ({ client, ...session }))
  );
