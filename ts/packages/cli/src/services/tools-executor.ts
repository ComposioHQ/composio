import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Context, Effect, Layer } from 'effect';
import {
  isComposioError,
  type ComposioClientShape,
  type ComposioError,
} from '@composio/client/effect';
import type {
  SessionExecuteResponse,
  SessionExecuteMetaResponse,
} from '@composio/client/resources/tool-router';
import { ComposioClientSingleton, type ToolkitProjectScope } from 'src/services/composio-clients';
import {
  createToolRouterSessionFromContext,
  resolveToolRouterSessionContext,
  type ToolRouterSessionContext,
} from 'src/effects/create-tool-router-session';
import {
  DashboardToolExecution,
  type DashboardToolExecutionError,
  type DashboardToolExecutionShape,
} from 'src/services/dashboard-tool-execution';
import { gateToolExecution, type PermissionGateResult } from 'src/services/tool-permissions';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
} from 'src/services/composio-error-overrides';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import type { CliDebugFlags } from 'src/services/runtime-flags';
import {
  readRunStagedFiles,
  ToolFileUploadError,
  uploadToolInputFiles,
} from 'src/services/tool-file-uploads';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { APP_CONFIG } from 'src/config';
import { isMetaToolSlug } from 'src/utils/meta-tool-slugs';
import { toolInputRequiredError, type ToolInputRequiredError } from 'src/utils/tool-input-required';
import type { NodeOs } from 'src/services/node-os';
import type { NodeProcess } from 'src/services/node-process';
import type { ComposioUserContext } from 'src/services/user-context';
import type { ComposioToolkitsRepository } from 'src/services/composio-clients';
import type { TerminalUI } from 'src/services/terminal-ui';
import type { ComposioCliUserConfig } from 'src/services/cli-user-config';

/**
 * Where the execution itself is sent. Connection lookups, the permission gate
 * and file uploads go to the backend either way.
 */
export type ToolExecutionTarget =
  | { readonly kind: 'backend' }
  /** `orgId` is the organization the Dashboard resolves the consumer project from. */
  | { readonly kind: 'dashboard'; readonly orgId: string };

/**
 * Parameters accepted by the Tool Router-based executor.
 */
export interface ToolExecuteParams {
  readonly userId: string;
  /** Chosen by the command, never inferred by the executor. */
  readonly target: ToolExecutionTarget;
  readonly arguments: Record<string, unknown>;
  readonly client?: ComposioClientShape;
  readonly connectedAccounts?: Record<string, string>;
  /**
   * The org/project the command resolved. The executor's tool-schema lookup
   * keys its memoized `get_latest_version` on this, so it has to match what
   * the command's own version check passed or the two never share a request.
   */
  readonly projectScope?: {
    readonly orgId?: string;
    readonly projectId?: string;
  };
  readonly cacheScope?: {
    readonly orgId: string;
    readonly projectId: string;
    readonly consumerUserId: string;
  };
}

/**
 * The project custom toolkits are listed for: the command's resolved one when
 * it handed in both ids, otherwise whatever the project context resolves.
 */
const toolkitProjectScope = ({
  projectScope,
}: ToolExecuteParams): ToolkitProjectScope | undefined =>
  projectScope?.orgId && projectScope.projectId
    ? { orgId: projectScope.orgId, projectId: projectScope.projectId }
    : undefined;

/**
 * Normalized response that matches the shape consumers expect.
 */
export interface ToolExecuteResponse {
  readonly successful: boolean;
  readonly data: Record<string, unknown>;
  readonly error: string | null;
  readonly logId: string;
  readonly permissionApproval?: NonNullable<PermissionGateResult>['approvalStatus'];
  readonly instantCharge?: InstantCharge;
}

/** Charge billed to the org when the call ran on a Composio instant account. */
export interface InstantCharge {
  readonly amount: string;
  readonly currency: 'USD';
  readonly chargedBy: 'composio';
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
    | ComposioClientSingleton
    | ComposioToolkitsRepository
    | ComposioCliUserConfig
    | TerminalUI
    // Tool-schema resolution emits `--tool-debug` diagnostics, whose flag values the caller owns.
    | CliDebugFlags
  >;
}

export const ToolsExecutor = Context.Service<ToolsExecutor>('services/ToolsExecutor');

/**
 * Whether an execution answer describes a tool that ran and succeeded.
 *
 * `result_type` decides: a `failed` execution is not successful even when its
 * `error` is `null` or empty. `@composio/core` applies the same rule to
 * session executions.
 */
export const isExecutionSuccessful = (raw: {
  readonly result_type: 'completed' | 'failed' | 'blocked';
}): boolean => raw.result_type === 'completed';

/** A Tool Router answer that carries a result rather than a request for more input. */
type ExecutedSessionResponse = Exclude<
  SessionExecuteResponse | SessionExecuteMetaResponse,
  { result_type: 'input_required' }
>;

/** Sends the prepared arguments to where the tool runs. Called once per invocation. */
type ToolExecutionSend = (
  arguments_: Record<string, unknown>
) => Effect.Effect<
  ExecutedSessionResponse,
  ComposioError | ToolInputRequiredError | DashboardToolExecutionError,
  FileSystem.FileSystem | Path.Path | NodeOs
>;

const toInstantCharge = (raw: ExecutedSessionResponse): InstantCharge | undefined => {
  if (!raw.instant_charge) return undefined;
  return {
    amount: raw.instant_charge.amount,
    currency: raw.instant_charge.currency,
    chargedBy: raw.instant_charge.charged_by,
  };
};

/**
 * Normalize the raw Tool Router response into the shape the CLI commands expect.
 */
export const normalizeResponse = (
  raw: ExecutedSessionResponse,
  permissionGateResult?: PermissionGateResult
): ToolExecuteResponse => {
  // A call a session hook blocked carries the hook's message instead of a
  // result. Like `@composio/core`, the CLI reports it as a failed call with
  // that message.
  const outcome =
    raw.result_type === 'blocked'
      ? { data: {}, error: raw.message, logId: raw.log_id ?? '' }
      : { data: raw.data, error: raw.error, logId: raw.log_id };
  const response: ToolExecuteResponse = {
    successful: isExecutionSuccessful(raw),
    ...outcome,
    ...(permissionGateResult?.approvalStatus
      ? { permissionApproval: permissionGateResult.approvalStatus }
      : {}),
  };
  const instantCharge = toInstantCharge(raw);
  if (!instantCharge) return response;
  return { ...response, instantCharge };
};

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

/**
 * The backend transport: creates the Tool Router session and returns the
 * handle that executes on it. One session per invocation — CLI runs one tool
 * per process.
 */
const createBackendSend = (
  client: ComposioClientShape,
  userId: string,
  slug: string,
  sessionContext: ToolRouterSessionContext
) =>
  createToolRouterSessionFromContext(client, userId, sessionContext).pipe(
    Effect.map(
      ({ sessionId }): ToolExecutionSend =>
        arguments_ =>
          Effect.gen(function* () {
            // An execution is not `idempotent`, so it is sent once: a retry after the backend
            // already acted duplicates the side effect (e.g. sends the same email twice). The
            // response is not validated either, for the same reason.
            const raw: SessionExecuteResponse | SessionExecuteMetaResponse = yield* isMetaToolSlug(
              slug
            )
              ? client.toolRouter.session.executeMeta(sessionId, { slug, arguments: arguments_ })
              : client.toolRouter.session.execute(sessionId, {
                  tool_slug: slug,
                  arguments: arguments_,
                });
            if (raw.result_type === 'input_required') {
              return yield* toolInputRequiredError(`Tool ${slug}`, raw);
            }
            return raw;
          })
    )
  );

/**
 * The Dashboard transport: the Dashboard creates the session and resolves the
 * user itself, so the CLI sends no session settings, only the account it
 * resolved for this tool's toolkit.
 */
const createDashboardSend =
  (
    dashboard: DashboardToolExecutionShape,
    slug: string,
    orgId: string,
    connectedAccounts: ToolExecuteParams['connectedAccounts']
  ): ToolExecutionSend =>
  arguments_ => {
    const request = { slug, arguments: arguments_, orgId };
    if (isMetaToolSlug(slug)) return dashboard.executeMeta(request);
    const [account] = Object.values(connectedAccounts ?? {});
    return dashboard.execute({ ...request, account });
  };

/**
 * What has to happen before the call is sent, whichever transport sends it:
 * the permission gate, then the arguments with their file inputs uploaded.
 */
const prepareToolExecution = (
  client: ComposioClientShape,
  slug: string,
  params: ToolExecuteParams,
  { permissionSnapshot, connectedAccounts, connectedAccountWordIds }: ToolRouterSessionContext
) =>
  Effect.gen(function* () {
    const toolkitSlug = yield* toolkitFromToolSlug(slug, toolkitProjectScope(params));
    const permissionGateResult = yield* gateToolExecution({
      toolSlug: slug,
      connectedAccountId: toolkitSlug ? connectedAccounts?.[toolkitSlug] : undefined,
      connectedAccountWordId: toolkitSlug ? connectedAccountWordIds?.[toolkitSlug] : undefined,
      snapshot: permissionSnapshot,
    });
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = yield* Effect.orDie(APP_CONFIG.RUN_STAGED_FILES_FILE);
    const stagedFiles = yield* readRunStagedFiles(fs, manifestPath);
    const preparedArguments = isMetaToolSlug(slug)
      ? params.arguments
      : yield* getOrFetchToolInputDefinition(slug, params.projectScope).pipe(
          Effect.catch(() => Effect.succeed(null)),
          Effect.flatMap(definition => {
            if (!definition) {
              return Effect.succeed(params.arguments);
            }

            // A presigned-URL request the API refused is reported as
            // an upload failure of the source, with the client's error
            // as its cause.
            return uploadToolInputFiles({
              fs,
              path,
              toolSlug: slug,
              toolkitSlug,
              arguments_: params.arguments,
              inputSchema: definition.schema,
              client,
              stagedFiles,
            }).pipe(
              Effect.catchIf(
                isComposioError,
                cause =>
                  new ToolFileUploadError({
                    cause,
                    message: cause.message,
                    reason: 'source-read',
                  })
              )
            );
          })
        );

    return { permissionGateResult, preparedArguments };
  });

export const ToolsExecutorLive = Layer.effect(
  ToolsExecutor,
  Effect.gen(function* () {
    // Resolve the client singleton at layer construction time.
    // The `get` instance method is an Effect.fn that lazily initializes
    // the Composio client on first call — no environment requirements.
    const clientSingleton = yield* ComposioClientSingleton;

    // Held rather than required per call: which slugs resolve locally is an
    // implementation detail of toolkit resolution, not part of what a caller
    // has to hand the executor.
    const slugCatalog = yield* ToolkitSlugCatalog;
    const dashboard = yield* DashboardToolExecution;

    return ToolsExecutor.of({
      execute: (slug, params) =>
        Effect.gen(function* () {
          // Resolved lazily: `get()` walks the project context off disk, and every
          // caller on the execute path already hands in a client built for the
          // resolved org/project.
          const resolvedClient = params.client ?? (yield* clientSingleton.get());
          const sessionContext = yield* resolveToolRouterSessionContext(
            resolvedClient,
            params.userId,
            {
              manageConnections: true,
              connectedAccounts: params.connectedAccounts,
              cacheScope: params.cacheScope,
            }
          );
          const { target } = params;
          const send =
            target.kind === 'dashboard'
              ? createDashboardSend(dashboard, slug, target.orgId, params.connectedAccounts)
              : yield* createBackendSend(resolvedClient, params.userId, slug, sessionContext);
          const { permissionGateResult, preparedArguments } = yield* prepareToolExecution(
            resolvedClient,
            slug,
            params,
            sessionContext
          );

          const raw = yield* send(preparedArguments);

          return normalizeResponse(raw, permissionGateResult);
        }).pipe(
          Effect.catch(error =>
            toolkitFromToolSlug(slug, toolkitProjectScope(params)).pipe(
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
