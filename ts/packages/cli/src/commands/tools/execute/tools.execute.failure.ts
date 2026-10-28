import { Effect } from 'effect';
import { trackCliCodactFailureEffect, trackCliEventEffect } from 'src/analytics/dispatch';
import {
  getToolExecuteFailedEvent,
  getToolExecuteToolNotFoundEvent,
  getToolExecuteValidationFailedEvent,
  isMaybeToolValidationError,
  isMaybeToolNotFoundError,
} from 'src/analytics/events';
import * as constants from 'src/constants';
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
import { connectionTips, formatUnknownObject, redactRequestId } from './tools.execute.format';

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

export const handleExecutionError = (
  ui: TerminalUI,
  error: unknown,
  context: {
    toolSlug: string;
    args: Record<string, unknown>;
    surface: 'root' | 'dev';
    projectMode: 'consumer' | 'developer';
    stage: 'schema_fetch' | 'dry_run' | 'validation' | 'execution';
    logId?: string;
    projectScope?: ToolkitProjectScope;
  }
) =>
  Effect.gen(function* () {
    const toolkit = yield* toolkitFromToolSlug(context.toolSlug, context.projectScope);
    const mapped = mapComposioError({ error, toolkit, toolSlug: context.toolSlug });
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
        [`Schema: ${normalized.schemaPath}`, ...normalized.issues.map(issue => `- ${issue}`)].join(
          '\n'
        ),
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

    if (normalized instanceof ComposioNoActiveConnectionError) {
      yield* ui.log.error(mapped.message);
      if (toolkit) {
        yield* ui.note(
          connectionTips({ toolkit, toolSlug: context.toolSlug, surface: context.surface }),
          'Tips'
        );
      }
      return { error: mapped.message, slug: slugValue ?? context.toolSlug };
    }

    yield* ui.log.error(mapped.message);

    const detailsObject = apiDetails;
    if (detailsObject) {
      yield* ui.note(formatUnknownObject(redactRequestId(detailsObject)), 'Error details');
    }

    return { error: mapped.message, slug: slugValue };
  });
