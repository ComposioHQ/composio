import { FileSystem } from '@effect/platform';
import { Context, Effect, Layer } from 'effect';
import type { Composio } from '@composio/client';
import type {
  SessionExecuteResponse,
  SessionExecuteMetaResponse,
  SessionExecuteMetaParams,
} from '@composio/client/resources/tool-router';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { createToolRouterSession } from 'src/effects/create-tool-router-session';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
} from 'src/services/composio-error-overrides';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import { uploadToolInputFiles } from 'src/services/tool-file-uploads';
import type { NodeOs } from 'src/services/node-os';
import type { NodeProcess } from 'src/services/node-process';
import type { ComposioUserContext } from 'src/services/user-context';
import type { ComposioToolkitsRepository } from 'src/services/composio-clients';

/**
 * Parameters accepted by the Tool Router-based executor.
 */
export interface ToolExecuteParams {
  readonly userId: string;
  readonly arguments: Record<string, unknown>;
  readonly client?: Composio;
  readonly cacheScope?: {
    readonly orgId: string;
    readonly consumerUserId: string;
  };
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
  ) => Effect.Effect<
    ToolExecuteResponse,
    unknown,
    FileSystem.FileSystem | NodeOs | NodeProcess | ComposioUserContext | ComposioToolkitsRepository
  >;
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

/**
 * Detect in-band error hints in tool response data.
 *
 * Some external services (e.g. Metabase) return HTTP 200 with the error
 * embedded inside the data payload.  This does NOT override `successful` —
 * the tool execution itself succeeded — but returns a warning message so
 * the CLI display layer can surface it to the user.
 */
export const detectInBandWarning = (
  data: Record<string, unknown> | null | undefined
): string | null => {
  if (data == null) return null;

  if (typeof data.status === 'string') {
    const status = data.status.toLowerCase();
    if (status === 'failed' || status === 'error') {
      if (typeof data.error === 'string') return data.error;
      if (typeof data.message === 'string') return data.message;
      return `Tool response contains status: ${data.status}`;
    }
  }

  if (data.successfull === false || data.successful === false) {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    return 'Tool response indicates unsuccessful execution';
  }
  return null;
};

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
          const resolvedClient = params.client ?? client;
          // One session per invocation — CLI runs one tool per process.
          const sessionId = yield* createToolRouterSession(resolvedClient, params.userId, {
            manageConnections: true,
            cacheScope: params.cacheScope,
          });
          const normalizedArguments = isMetaToolSlug(slug)
            ? params.arguments
            : yield* getOrFetchToolInputDefinition(slug).pipe(
                Effect.catchAll(() => Effect.succeed(null)),
                Effect.flatMap(definition => {
                  if (!definition) {
                    return Effect.succeed(params.arguments);
                  }

                  return Effect.tryPromise(() =>
                    uploadToolInputFiles({
                      toolSlug: slug,
                      arguments_: params.arguments,
                      inputSchema: definition.schema,
                      client: resolvedClient,
                    })
                  );
                })
              );

          const raw: SessionExecuteResponse | SessionExecuteMetaResponse = yield* Effect.tryPromise(
            () => {
              if (isMetaToolSlug(slug)) {
                return resolvedClient.toolRouter.session.executeMeta(sessionId, {
                  slug,
                  arguments: normalizedArguments,
                });
              }
              return resolvedClient.toolRouter.session.execute(sessionId, {
                tool_slug: slug,
                arguments: normalizedArguments,
              });
            }
          );

          return normalizeResponse(raw);
        }).pipe(
          Effect.catchAll((error): Effect.Effect<never, unknown> => {
            const mapped = mapComposioError({ error, toolSlug: slug });
            if (mapped.normalized instanceof ComposioNoActiveConnectionError) {
              return Effect.fail(mapped.normalized);
            }
            return Effect.fail(error);
          })
        ),
    });
  })
);
