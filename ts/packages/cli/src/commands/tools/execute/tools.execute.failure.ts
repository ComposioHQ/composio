import { Effect, Option } from 'effect';
import { trackCliCodactFailureEffect, trackCliEventEffect } from 'src/analytics/dispatch';
import {
  getToolExecuteFailedEvent,
  getToolExecuteToolNotFoundEvent,
  getToolExecuteValidationFailedEvent,
  isMaybeToolValidationError,
  isMaybeToolNotFoundError,
} from 'src/analytics/events';
import * as constants from 'src/constants';
import { retryAdviceFor, retryHint, type RetryAdvice } from 'src/effects/retry-advice';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import type { ToolkitProjectScope } from 'src/services/composio-clients';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
  normalizeCliError,
} from 'src/services/composio-error-overrides';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import type { TerminalUI } from 'src/services/terminal-ui';
import { ToolInputValidationError } from 'src/services/tool-input-validation';
import type { ToolExecuteResponse } from 'src/services/tools-executor';
import { escapeTerminalLines, escapeTerminalText } from 'src/ui/escape-terminal-text';
import { connectionTips, formatUnknownObject, redactRequestId } from './tools.execute.format';

/** The tool a failure belongs to, and where its toolkit is looked up. */
export type ExecuteFailureScope = {
  readonly toolSlug: string;
  readonly surface: 'root' | 'dev';
  readonly projectScope?: ToolkitProjectScope;
};

/**
 * What a tool's execution failed with, before any command reports it: the original cause, its
 * toolkit, how `mapComposioError` reads it, and whether the same request can be sent again.
 */
export type ExecuteFailure = {
  readonly cause: unknown;
  readonly toolkit: string | undefined;
  readonly mapped: ReturnType<typeof mapComposioError>;
  readonly retry: Option.Option<RetryAdvice>;
};

const inspect = (cause: unknown, scope: ExecuteFailureScope, retry: Option.Option<RetryAdvice>) =>
  toolkitFromToolSlug(scope.toolSlug, scope.projectScope).pipe(
    Effect.map((toolkit): ExecuteFailure => ({
      cause,
      toolkit,
      mapped: mapComposioError({
        error: cause,
        toolkit,
        toolSlug: scope.toolSlug,
        tree: scope.surface,
      }),
      retry,
    }))
  );

/**
 * A typed failure of the execution (validation, a request, the Dashboard), with its retry advice.
 */
export const inspectExecuteFailure = (error: unknown, scope: ExecuteFailureScope) =>
  inspect(error, scope, retryAdviceFor(error));

/**
 * A response the tool answered with `successful: false`: its error, or the response itself when
 * it has none. The request was answered, so there is no retry advice.
 */
export const inspectFailedResponse = (response: ToolExecuteResponse, scope: ExecuteFailureScope) =>
  inspect(response.error ?? response, scope, Option.none());

export const emitExecuteFailureTelemetry = (params: {
  readonly toolSlug: string;
  readonly args: Record<string, unknown>;
  readonly error: unknown;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'schema_fetch' | 'dry_run' | 'validation' | 'execution';
  readonly logId?: string;
  readonly mappedError?: ReturnType<typeof mapComposioError>;
  readonly projectScope?: ToolkitProjectScope;
}) =>
  Effect.gen(function* () {
    const toolkitSlug = yield* toolkitFromToolSlug(params.toolSlug, params.projectScope);
    const { invocationOrigin } = yield* cliInvocationContext;
    const normalized = params.mappedError?.normalized ?? normalizeCliError(params.error);
    const failureOrigin: 'fast_fail' | 'main_endpoint' =
      normalized instanceof ToolInputValidationError || params.stage !== 'execution'
        ? 'fast_fail'
        : 'main_endpoint';

    if (normalized instanceof ToolInputValidationError) {
      yield* trackCliEventEffect(
        getToolExecuteValidationFailedEvent({
          toolSlug: params.toolSlug,
          toolkitSlug,
          args: params.args,
          error: normalized,
          invocationOrigin,
          surface: params.surface,
          projectMode: params.projectMode,
          stage: params.stage === 'dry_run' ? 'dry_run' : 'validation',
          failureOrigin,
          logId: params.logId,
        })
      );
      yield* trackCliCodactFailureEffect({
        failureType: 'wrong_tool_input_param',
        toolInfo: {
          ...(toolkitSlug ? { toolkit: toolkitSlug } : {}),
        },
        ctx: {
          tool_slug: params.toolSlug,
          issues: [...normalized.issues].slice(0, 50),
          schema_path: normalized.schemaPath,
          stage: params.stage === 'dry_run' ? 'dry_run' : 'validation',
        },
        session: {
          source: 'cli',
          command_path: params.surface === 'root' ? 'execute' : 'dev playground-execute',
          project_mode: params.projectMode,
          surface: params.surface,
          cli_version: constants.APP_VERSION,
        },
      });
      return;
    }

    const mapped =
      params.mappedError ??
      mapComposioError({
        error: params.error,
        toolkit: toolkitSlug,
        toolSlug: params.toolSlug,
        tree: params.surface,
      });
    const apiDetails = mapped.apiDetails;
    const message = mapped.message;
    const errorSlug = mapped.slugValue;
    const status = apiDetails?.status;
    const apiCode = apiDetails?.code;
    const isNoConnectionError =
      normalized instanceof ComposioNoActiveConnectionError || Boolean(mapped.override);

    const isValidationError = isMaybeToolValidationError({ message, errorSlug, apiCode });
    const executionStage = params.stage === 'validation' ? 'execution' : params.stage;
    const failureEvent = () => {
      if (isValidationError) {
        return getToolExecuteValidationFailedEvent({
          toolSlug: params.toolSlug,
          toolkitSlug,
          args: params.args,
          error: new ToolInputValidationError({
            toolSlug: params.toolSlug,
            schemaPath: 'server',
            issues: [message],
          }),
          invocationOrigin,
          surface: params.surface,
          projectMode: params.projectMode,
          stage: params.stage === 'dry_run' ? 'dry_run' : 'execution',
          failureOrigin,
          logId: params.logId,
        });
      }
      if (isMaybeToolNotFoundError({ message, errorSlug, status, apiCode })) {
        return getToolExecuteToolNotFoundEvent({
          toolSlug: params.toolSlug,
          toolkitSlug,
          args: params.args,
          invocationOrigin,
          surface: params.surface,
          projectMode: params.projectMode,
          stage: executionStage,
          failureOrigin,
          logId: params.logId,
          errorSlug,
          status,
          apiCode,
          message,
        });
      }
      return getToolExecuteFailedEvent({
        toolSlug: params.toolSlug,
        toolkitSlug,
        args: params.args,
        invocationOrigin,
        surface: params.surface,
        projectMode: params.projectMode,
        stage: executionStage,
        failureOrigin,
        logId: params.logId,
        errorSlug,
        status,
        apiCode,
        message,
        errorName: normalized instanceof Error ? normalized.name : undefined,
        isNoConnectionError,
      });
    };

    yield* trackCliEventEffect(failureEvent());

    if (isNoConnectionError) {
      return;
    }

    if (isValidationError) {
      yield* trackCliCodactFailureEffect({
        failureType: 'wrong_tool_input_param',
        toolInfo: {
          ...(toolkitSlug ? { toolkit: toolkitSlug } : {}),
        },
        ctx: {
          tool_slug: params.toolSlug,
          error_slug: errorSlug,
          api_error_code: apiCode,
          http_status: status,
          error_message: message,
          stage: params.stage === 'dry_run' ? 'dry_run' : 'execution',
        },
        session: {
          source: 'cli',
          command_path: params.surface === 'root' ? 'execute' : 'dev playground-execute',
          project_mode: params.projectMode,
          surface: params.surface,
          cli_version: constants.APP_VERSION,
        },
        requestId: apiDetails?.request_id,
      });
      return;
    }

    if (
      isMaybeToolNotFoundError({
        message,
        errorSlug,
        status,
        apiCode,
      })
    ) {
      yield* trackCliCodactFailureEffect({
        failureType: 'wrong_tool_slug',
        toolInfo: {
          ...(toolkitSlug ? { toolkit: toolkitSlug } : {}),
        },
        ctx: {
          invalid_tool_slug: params.toolSlug,
          error_slug: errorSlug,
          api_error_code: apiCode,
          http_status: status,
          error_message: message,
          stage: params.stage === 'validation' ? 'execution' : params.stage,
        },
        session: {
          source: 'cli',
          command_path: params.surface === 'root' ? 'execute' : 'dev playground-execute',
          project_mode: params.projectMode,
          surface: params.surface,
          cli_version: constants.APP_VERSION,
        },
        requestId: apiDetails?.request_id,
      });
    }
  });

/**
 * Reports an inspected failure on the terminal and in telemetry, and summarizes it for the JSON
 * result.
 */
export const handleExecutionError = (
  ui: TerminalUI,
  failure: ExecuteFailure,
  context: ExecuteFailureScope & {
    readonly args: Record<string, unknown>;
    readonly projectMode: 'consumer' | 'developer';
    readonly stage: 'schema_fetch' | 'dry_run' | 'validation' | 'execution';
    readonly logId?: string;
  }
) =>
  Effect.gen(function* () {
    const { cause: error, toolkit, mapped } = failure;
    const normalized = mapped.normalized;
    if (normalized instanceof ToolInputValidationError) {
      yield* emitExecuteFailureTelemetry({
        toolSlug: context.toolSlug,
        args: context.args,
        error: normalized,
        surface: context.surface,
        projectMode: context.projectMode,
        stage: context.stage,
        logId: context.logId,
        projectScope: context.projectScope,
      });
      yield* ui.log.error(`Input validation failed for ${context.toolSlug}`);
      yield* ui.note(
        [
          `Schema: ${normalized.schemaPath}`,
          ...normalized.issues.map(issue => `- ${escapeTerminalText(issue)}`),
        ].join('\n'),
        'Tool schema validation'
      );
      return { error: normalized.message, slug: context.toolSlug };
    }

    const apiDetails = mapped.apiDetails;
    const slugValue = mapped.slugValue;

    yield* emitExecuteFailureTelemetry({
      toolSlug: context.toolSlug,
      args: context.args,
      error,
      surface: context.surface,
      projectMode: context.projectMode,
      stage: context.stage,
      logId: context.logId,
      projectScope: context.projectScope,
      mappedError: mapped,
    });

    // The message and details can quote the API or the tool; the returned summary keeps them as
    // they are for the JSON result.
    const displayMessage = escapeTerminalText(mapped.message);
    if (normalized instanceof ComposioNoActiveConnectionError) {
      yield* ui.log.error(displayMessage);
      if (toolkit) {
        yield* ui.note(
          connectionTips({ toolkit, toolSlug: context.toolSlug, surface: context.surface }),
          'Tips'
        );
      }
      return { error: mapped.message, slug: slugValue ?? context.toolSlug };
    }

    yield* ui.log.error(displayMessage);

    const detailsObject = apiDetails;
    if (detailsObject) {
      yield* ui.note(
        escapeTerminalLines(formatUnknownObject(redactRequestId(detailsObject))),
        'Error details'
      );
    }

    return { error: mapped.message, slug: slugValue };
  });

/**
 * Tells the reader on a terminal whether the failed execution can be run again. Off a terminal it
 * prints nothing, like the rest of the failure: the JSON result on stdout carries it as `retry`.
 * In the developer tree, a request that may have taken effect also names where recent executions
 * are listed.
 */
export const printExecuteRetryAdvice = (
  ui: TerminalUI,
  advice: RetryAdvice,
  surface: 'root' | 'dev'
) =>
  ui.log.step(
    advice === 'check-first' && surface === 'dev'
      ? `${retryHint(advice)}\nRecent tool executions:\n> composio dev logs tools`
      : retryHint(advice)
  );
