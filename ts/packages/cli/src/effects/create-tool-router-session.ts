import { Effect, Option } from 'effect';
import type { Composio } from '@composio/client';
import {
  getFreshConsumerToolRouterAuthConfigsFromCache,
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
    const cachedAuthConfigs = options?.cacheScope
      ? yield* getFreshConsumerToolRouterAuthConfigsFromCache({
          orgId: options.cacheScope.orgId,
          consumerUserId: options.cacheScope.consumerUserId,
          toolkits: options.toolkits,
        })
      : Option.none();

    const connectionContext = Option.isSome(cachedAuthConfigs)
      ? {
          connectedToolkits: options?.toolkits ?? [],
          authConfigs: cachedAuthConfigs.value.authConfigs,
        }
      : yield* resolveToolRouterSessionConnections(client, userId, {
          toolkits: options?.toolkits,
        });

    if (options?.cacheScope && Option.isNone(cachedAuthConfigs)) {
      yield* writeConsumerConnectedToolkitsCache({
        orgId: options.cacheScope.orgId,
        consumerUserId: options.cacheScope.consumerUserId,
        toolkits: connectionContext.connectedToolkits,
        toolRouterAuthConfigs: {
          authConfigs: connectionContext.authConfigs,
        },
      }).pipe(Effect.catchAll(() => Effect.void));
    }

    return yield* Effect.tryPromise(() =>
      client.toolRouter.session.create({
        user_id: userId,
        auth_configs: connectionContext.authConfigs,
        manage_connections: { enable: options?.manageConnections ?? false },
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
