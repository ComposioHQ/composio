import { Context, Effect, Layer } from 'effect';
import type {
  SessionExecuteResponse,
  SessionExecuteMetaResponse,
  SessionExecuteMetaParams,
} from '@composio/client/resources/tool-router';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { createToolRouterSession } from 'src/effects/create-tool-router-session';
import {
  extractMessage,
  extractSlug,
  extractApiErrorDetails,
} from 'src/utils/api-error-extraction';

/** Error slugs that indicate a missing connected account / no active connection. */
const NO_CONNECTION_SLUGS: ReadonlySet<string> = new Set([
  'ActionExecute_ConnectedAccountNotFound',
  'ToolRouterV2_NoActiveConnection',
]);

export const isNoConnectionSlug = (slug: string | undefined | null): boolean =>
  slug != null && NO_CONNECTION_SLUGS.has(slug);

export class ActionExecuteConnectedAccountNotFoundError extends Error {
  readonly details: unknown;

  constructor(details: unknown) {
    const message = extractMessage(details) ?? 'No connected account found for this user/toolkit.';
    super(message);
    this.name = 'ActionExecuteConnectedAccountNotFoundError';
    this.details = details;
  }
}

/**
 * Parameters accepted by the Tool Router-based executor.
 */
export interface ToolExecuteParams {
  readonly userId: string;
  readonly arguments: Record<string, unknown>;
}

/**
 * Normalized response that matches the shape consumers expect.
 */
export interface ToolExecuteResponse {
  readonly successful: boolean;
  readonly data: Record<string, unknown>;
  readonly error: string | null;
  readonly logId: string;
}

export interface ToolsExecutor {
  readonly execute: (
    slug: string,
    params: ToolExecuteParams
  ) => Effect.Effect<ToolExecuteResponse, unknown>;
}

export const ToolsExecutor = Context.GenericTag<ToolsExecutor>('services/ToolsExecutor');

/**
 * Meta tool slugs handled by `session.executeMeta` instead of `session.execute`.
 *
 * The `satisfies` constraint ensures this list stays in sync with the API's
 * `SessionExecuteMetaParams['slug']` union — a compile error will surface if
 * a slug is misspelled or if the API adds/removes a meta tool.
 */
const META_TOOL_SLUG_LIST = [
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_MULTI_EXECUTE_TOOL',
  'COMPOSIO_MANAGE_CONNECTIONS',
  'COMPOSIO_WAIT_FOR_CONNECTIONS',
  'COMPOSIO_REMOTE_WORKBENCH',
  'COMPOSIO_REMOTE_BASH_TOOL',
  'COMPOSIO_GET_TOOL_SCHEMAS',
  'COMPOSIO_UPSERT_RECIPE',
  'COMPOSIO_GET_RECIPE',
] as const satisfies ReadonlyArray<SessionExecuteMetaParams['slug']>;

const META_TOOL_SLUGS: ReadonlySet<string> = new Set(META_TOOL_SLUG_LIST);

const isMetaToolSlug = (slug: string): slug is SessionExecuteMetaParams['slug'] =>
  META_TOOL_SLUGS.has(slug);

/**
 * Normalize the raw Tool Router response into the shape the CLI commands expect.
 */
const normalizeResponse = (
  raw: SessionExecuteResponse | SessionExecuteMetaResponse
): ToolExecuteResponse => ({
  successful: raw.error === null,
  data: raw.data,
  error: raw.error,
  logId: raw.log_id,
});

export const ToolsExecutorLive = Layer.effect(
  ToolsExecutor,
  Effect.gen(function* () {
    // Resolve the client singleton at layer construction time.
    // The `get` instance method is an Effect.fn that lazily initializes
    // the raw Composio client on first call — no environment requirements.
    const clientSingleton = yield* ComposioClientSingleton;

    return ToolsExecutor.of({
      execute: (slug, params) =>
        Effect.gen(function* () {
          const client = yield* clientSingleton.get();
          // One session per invocation — CLI runs one tool per process.
          const sessionId = yield* createToolRouterSession(client, params.userId, {
            manageConnections: true,
          });

          const raw: SessionExecuteResponse | SessionExecuteMetaResponse = yield* Effect.tryPromise(
            () => {
              if (isMetaToolSlug(slug)) {
                return client.toolRouter.session.executeMeta(sessionId, {
                  slug,
                  arguments: params.arguments,
                });
              }
              return client.toolRouter.session.execute(sessionId, {
                tool_slug: slug,
                arguments: params.arguments,
              });
            }
          );

          return normalizeResponse(raw);
        }).pipe(
          Effect.catchAll((error): Effect.Effect<never, unknown> => {
            const apiDetails = extractApiErrorDetails(error);
            const slugValue = apiDetails?.slug ?? extractSlug(error);
            if (isNoConnectionSlug(slugValue)) {
              return Effect.fail(
                new ActionExecuteConnectedAccountNotFoundError(apiDetails ?? error)
              );
            }
            return Effect.fail(error);
          })
        ),
    });
  })
);
