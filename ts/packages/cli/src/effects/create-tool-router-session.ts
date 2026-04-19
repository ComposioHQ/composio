import { Effect, Option } from 'effect';
import type { Composio } from '@composio/client';
import {
  getFreshConsumerToolRouterAuthConfigsFromCache,
  getFreshConsumerToolRouterConnectedAccountsFromCache,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { resolveToolRouterSessionConnections } from 'src/services/tool-router-session-connections';

export interface CreateToolRouterSessionOptions {
  /** Enable auto connection management. Default: false. */
  readonly manageConnections?: boolean;
  /** Restrict session to these toolkit slugs. */
  readonly toolkits?: ReadonlyArray<string>;
  /** Consumer-only cache scope for rolling auth-config reuse. */
  readonly cacheScope?: {
    readonly orgId: string;
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

/**
 * Create an ephemeral Tool Router session for the given user ID.
 * Returns the session ID string.
 *
 * Accepts a pre-resolved client instance (from ComposioClientSingleton)
 * so callers can resolve the dependency at layer construction time.
 * Used by `ToolsExecutorLive` which already holds the client reference.
 */
export const createToolRouterSession = (
  client: Composio,
  userId: string,
  options?: CreateToolRouterSessionOptions
) =>
  Effect.gen(function* () {
    const mergeConnectedAccounts = (...mappings: Array<Record<string, string> | undefined>) => {
      const merged = Object.assign({}, ...mappings.filter(Boolean));
      return Object.keys(merged).length > 0 ? merged : undefined;
    };
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

    const cachedAuthConfigs = options?.cacheScope
      ? yield* getFreshConsumerToolRouterAuthConfigsFromCache({
          orgId: options.cacheScope.orgId,
          consumerUserId: options.cacheScope.consumerUserId,
          toolkits: options.toolkits,
        })
      : Option.none();
    const cachedConnectedAccounts = options?.cacheScope
      ? yield* getFreshConsumerToolRouterConnectedAccountsFromCache({
          orgId: options.cacheScope.orgId,
          consumerUserId: options.cacheScope.consumerUserId,
          toolkits: options.toolkits,
        })
      : Option.none();

    const connectionContext = Option.isSome(cachedAuthConfigs)
      ? {
          connectedToolkits: options?.toolkits ?? [],
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
          toolkits: options?.toolkits,
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
      }).pipe(Effect.catchAll(() => Effect.void));
    }

    return yield* Effect.tryPromise(() =>
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
        toolkits:
          options?.toolkits && options.toolkits.length > 0
            ? { enable: [...options.toolkits] }
            : undefined,
      })
    ).pipe(Effect.map(session => session.session_id));
  });

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
  createToolRouterSession(client, userId, options).pipe(
    Effect.map(sessionId => ({ client, sessionId }))
  );
