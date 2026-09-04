import { FileSystem, Path } from '@effect/platform';
import { Context, Data, Effect, Layer } from 'effect';
import type { Composio } from '@composio/client';
import { executeLocalToolBySlug, resolveLocalTool } from '@composio/cli-local-tools';
import type {
  SessionExecuteResponse,
  SessionExecuteMetaResponse,
} from '@composio/client/resources/tool-router';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { createToolRouterSessionContext } from 'src/effects/create-tool-router-session';
import { gateToolExecution, type PermissionGateResult } from 'src/services/tool-permissions';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
} from 'src/services/composio-error-overrides';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import type { CliDebugFlags } from 'src/services/runtime-flags';
import { ToolFileUploadError, uploadToolInputFiles } from 'src/services/tool-file-uploads';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { isMetaToolSlug } from 'src/utils/meta-tool-slugs';
import type { NodeOs } from 'src/services/node-os';
import type { NodeProcess } from 'src/services/node-process';
import type { ComposioUserContext } from 'src/services/user-context';
import type { ComposioToolkitsRepository } from 'src/services/composio-clients';
import type { TerminalUI } from 'src/services/terminal-ui';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { CLI_EXPERIMENTAL_FEATURES } from 'src/constants';

/**
 * Parameters accepted by the Tool Router-based executor.
 */
export interface ToolExecuteParams {
  readonly userId: string;
  readonly arguments: Record<string, unknown>;
  readonly client?: Composio;
  readonly connectedAccounts?: Record<string, string>;
  readonly cacheScope?: {
    readonly orgId: string;
    readonly projectId: string;
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
  readonly permissionApproval?: NonNullable<PermissionGateResult>['approvalStatus'];
}

export interface ToolsExecutor {
  readonly execute: (
    slug: string,
    params: ToolExecuteParams
  ) => Effect.Effect<
    ToolExecuteResponse,
    unknown,
    | FileSystem.FileSystem
    | Path.Path
    | NodeOs
    | NodeProcess
    | ComposioUserContext
    | ComposioToolkitsRepository
    | ComposioCliUserConfig
    | TerminalUI
    // Tool-schema resolution emits `--tool-debug` diagnostics, whose flag values the caller owns.
    | CliDebugFlags
  >;
}

export const ToolsExecutor = Context.GenericTag<ToolsExecutor>('services/ToolsExecutor');

export class LocalToolsDisabledError extends Data.TaggedError('services/LocalToolsDisabledError')<{
  readonly toolSlug: string;
  readonly feature: string;
  readonly message: string;
}> {}

/**
 * Normalize the raw Tool Router response into the shape the CLI commands expect.
 */
const normalizeResponse = (
  raw: SessionExecuteResponse | SessionExecuteMetaResponse,
  permissionGateResult?: PermissionGateResult
): ToolExecuteResponse => ({
  successful: raw.error === null,
  data: raw.data,
  error: raw.error,
  logId: raw.log_id,
  ...(permissionGateResult?.approvalStatus
    ? { permissionApproval: permissionGateResult.approvalStatus }
    : {}),
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

    // Held rather than required per call: which slugs resolve locally is an
    // implementation detail of toolkit resolution, not part of what a caller
    // has to hand the executor.
    const slugCatalog = yield* ToolkitSlugCatalog;

    return ToolsExecutor.of({
      execute: (slug, params) =>
        Effect.gen(function* () {
          const cliConfig = yield* ComposioCliUserConfig;
          const localToolResolution = resolveLocalTool(slug, { includeUnsupported: true });
          const localToolsEnabled = cliConfig.isExperimentalFeatureEnabled(
            CLI_EXPERIMENTAL_FEATURES.LOCAL_TOOLS
          );
          if (localToolResolution && !localToolsEnabled) {
            return yield* new LocalToolsDisabledError({
              toolSlug: slug,
              feature: CLI_EXPERIMENTAL_FEATURES.LOCAL_TOOLS,
              message: `Local tools are experimental. Enable them with \`composio config experimental ${CLI_EXPERIMENTAL_FEATURES.LOCAL_TOOLS} on\` before executing ${slug}.`,
            });
          }

          if (localToolResolution) {
            const localResult = yield* Effect.tryPromise({
              try: () => executeLocalToolBySlug(slug, params.arguments),
              catch: cause => cause,
            });
            if (localResult) {
              return {
                successful: true,
                data: localResult,
                error: null,
                logId: '',
              } satisfies ToolExecuteResponse;
            }
          }

          const client = yield* clientSingleton.get();
          const resolvedClient = params.client ?? client;
          // One session per invocation — CLI runs one tool per process.
          const {
            sessionId,
            localExperimentalPayload,
            permissionSnapshot,
            connectedAccounts,
            connectedAccountWordIds,
          } = yield* createToolRouterSessionContext(resolvedClient, params.userId, {
            manageConnections: true,
            connectedAccounts: params.connectedAccounts,
            cacheScope: params.cacheScope,
          });
          const toolkitSlug = yield* toolkitFromToolSlug(slug);
          const permissionGateResult = yield* gateToolExecution({
            toolSlug: slug,
            connectedAccountId: toolkitSlug ? connectedAccounts?.[toolkitSlug] : undefined,
            connectedAccountWordId: toolkitSlug
              ? connectedAccountWordIds?.[toolkitSlug]
              : undefined,
            snapshot: permissionSnapshot,
          });
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const normalizedArguments = isMetaToolSlug(slug)
            ? params.arguments
            : yield* getOrFetchToolInputDefinition(slug).pipe(
                Effect.catchAll(() => Effect.succeed(null)),
                Effect.flatMap(definition => {
                  if (!definition) {
                    return Effect.succeed(params.arguments);
                  }

                  return Effect.tryPromise({
                    try: () =>
                      uploadToolInputFiles({
                        fs,
                        path,
                        toolSlug: slug,
                        toolkitSlug,
                        arguments_: params.arguments,
                        inputSchema: definition.schema,
                        client: resolvedClient,
                      }),
                    catch: cause =>
                      cause instanceof ToolFileUploadError
                        ? cause
                        : new ToolFileUploadError({
                            cause,
                            message: cause instanceof Error ? cause.message : String(cause),
                            reason: 'source-read',
                          }),
                  });
                })
              );

          const raw: SessionExecuteResponse | SessionExecuteMetaResponse = yield* Effect.tryPromise(
            {
              try: () => {
                if (isMetaToolSlug(slug)) {
                  return resolvedClient.toolRouter.session.executeMeta(sessionId, {
                    slug,
                    arguments: normalizedArguments,
                  });
                }
                const executePayload = {
                  tool_slug: slug,
                  arguments: normalizedArguments,
                  ...(localExperimentalPayload ? { experimental: localExperimentalPayload } : {}),
                };
                return resolvedClient.toolRouter.session.execute(sessionId, executePayload);
              },
              catch: cause => cause,
            }
          );

          return normalizeResponse(raw, permissionGateResult);
        }).pipe(
          Effect.catchAll(error =>
            toolkitFromToolSlug(slug).pipe(
              Effect.flatMap(toolkitSlug => {
                const mapped = mapComposioError({ error, toolkit: toolkitSlug, toolSlug: slug });
                return Effect.fail(
                  mapped.normalized instanceof ComposioNoActiveConnectionError
                    ? mapped.normalized
                    : error
                );
              })
            )
          ),
          Effect.provideService(ToolkitSlugCatalog, slugCatalog)
        ),
    });
  })
);
