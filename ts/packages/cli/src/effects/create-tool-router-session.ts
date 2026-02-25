import { Effect } from 'effect';
import type { Composio } from '@composio/client';
import { ComposioClientSingleton } from 'src/services/composio-clients';

export interface CreateToolRouterSessionOptions {
  /** Enable auto connection management. Default: false. */
  readonly manageConnections?: boolean;
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
  Effect.tryPromise(() =>
    client.toolRouter.session.create({
      user_id: userId,
      manage_connections: { enable: options?.manageConnections ?? false },
    })
  ).pipe(Effect.map(session => session.session_id));

/**
 * Resolve the Composio client and create a Tool Router session in one step.
 * Returns `{ client, sessionId }` — eliminates the 3-step boilerplate
 * (resolve singleton, get client, create session) repeated across commands.
 */
export const resolveToolRouterSession = (
  userId: string,
  options?: CreateToolRouterSessionOptions
) =>
  Effect.gen(function* () {
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.get();
    const sessionId = yield* createToolRouterSession(client, userId, options);
    return { client, sessionId };
  });
