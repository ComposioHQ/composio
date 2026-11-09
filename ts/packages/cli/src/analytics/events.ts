import { cliAnalyticsProvenance } from 'src/services/client-provenance';
import { Option } from 'effect';
import { CliError } from 'effect/cli';
import type { CliCommandTelemetryContext, TelemetryFamily, TrackEvent } from './types';
import { type CommandIdentity, commandPathOf } from 'src/invocation/command-identity';
import { APP_VERSION } from 'src/constants';
import { inferSkillReleaseChannel } from 'src/effects/install-skill';
import type { AgentHost } from 'src/services/agent-host';
import type { CliInvocationContext } from 'src/services/runtime-cli-context';
import { ChildProcessExited, ChildProcessSignaled } from 'src/effects/child-process-exited';
import { SetupCommandError } from 'src/services/setup-command-error';
import { ToolInputValidationError } from 'src/services/tool-input-validation';
import { guessToolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';

export const CLI_ANALYTICS_EVENTS = {
  CLI_COMMAND_INVOKED: 'CLI_COMMAND_INVOKED',
  CLI_COMMAND_SUCCEEDED: 'CLI_COMMAND_SUCCEEDED',
  CLI_COMMAND_FAILED: 'CLI_COMMAND_FAILED',
  CLI_EXECUTE_INVOKED: 'CLI_EXECUTE_INVOKED',
  CLI_EXECUTE_SUCCEEDED: 'CLI_EXECUTE_SUCCEEDED',
  CLI_EXECUTE_FAILED: 'CLI_EXECUTE_FAILED',
  CLI_SEARCH_INVOKED: 'CLI_SEARCH_INVOKED',
  CLI_SEARCH_SUCCEEDED: 'CLI_SEARCH_SUCCEEDED',
  CLI_SEARCH_FAILED: 'CLI_SEARCH_FAILED',
  CLI_LINK_INVOKED: 'CLI_LINK_INVOKED',
  CLI_LINK_SUCCEEDED: 'CLI_LINK_SUCCEEDED',
  CLI_LINK_FAILED: 'CLI_LINK_FAILED',
  CLI_LOGIN_INVOKED: 'CLI_LOGIN_INVOKED',
  CLI_LOGIN_SUCCEEDED: 'CLI_LOGIN_SUCCEEDED',
  CLI_LOGIN_FAILED: 'CLI_LOGIN_FAILED',
  CLI_LOGOUT_INVOKED: 'CLI_LOGOUT_INVOKED',
  CLI_LOGOUT_SUCCEEDED: 'CLI_LOGOUT_SUCCEEDED',
  CLI_LOGOUT_FAILED: 'CLI_LOGOUT_FAILED',
  CLI_PROXY_INVOKED: 'CLI_PROXY_INVOKED',
  CLI_PROXY_SUCCEEDED: 'CLI_PROXY_SUCCEEDED',
  CLI_PROXY_FAILED: 'CLI_PROXY_FAILED',
  CLI_RUN_INVOKED: 'CLI_RUN_INVOKED',
  CLI_RUN_SUCCEEDED: 'CLI_RUN_SUCCEEDED',
  CLI_RUN_FAILED: 'CLI_RUN_FAILED',
  CLI_INSTALL_INVOKED: 'CLI_INSTALL_INVOKED',
  CLI_INSTALL_SUCCEEDED: 'CLI_INSTALL_SUCCEEDED',
  CLI_INSTALL_FAILED: 'CLI_INSTALL_FAILED',
  CLI_SETUP_INVOKED: 'CLI_SETUP_INVOKED',
  CLI_SETUP_SUCCEEDED: 'CLI_SETUP_SUCCEEDED',
  CLI_SETUP_FAILED: 'CLI_SETUP_FAILED',
  CLI_SETUP_HOST_DETECTED: 'CLI_SETUP_HOST_DETECTED',
  CLI_SETUP_CANCELLED: 'CLI_SETUP_CANCELLED',
  CLI_SETUP_SKIPPED: 'CLI_SETUP_SKIPPED',
  CLI_PLUGIN_SETUP_SUCCEEDED: 'CLI_PLUGIN_SETUP_SUCCEEDED',
  CLI_PLUGIN_SETUP_FAILED: 'CLI_PLUGIN_SETUP_FAILED',
  CLI_PLUGIN_UNINSTALL_SUCCEEDED: 'CLI_PLUGIN_UNINSTALL_SUCCEEDED',
  CLI_PLUGIN_HINT_SHOWN: 'CLI_PLUGIN_HINT_SHOWN',
  CLI_TOOL_INVOCATION_VALIDATION_FAILED: 'CLI_TOOL_INVOCATION_VALIDATION_FAILED',
  CLI_TOOL_INVOCATION_TOOL_NOT_FOUND: 'CLI_TOOL_INVOCATION_TOOL_NOT_FOUND',
  CLI_TOOL_INVOCATION_FAILED: 'CLI_TOOL_INVOCATION_FAILED',
} as const;

type CliAnalyticsEventName = (typeof CLI_ANALYTICS_EVENTS)[keyof typeof CLI_ANALYTICS_EVENTS];

export const CLI_JOURNEY_STAGES = [
  'install',
  'setup',
  'login',
  'connect',
  'execute',
  'other',
] as const;

export type CliJourneyStage = (typeof CLI_JOURNEY_STAGES)[number];

export const CLI_EVENT_JOURNEY_STAGES = {
  CLI_COMMAND_INVOKED: 'other',
  CLI_COMMAND_SUCCEEDED: 'other',
  CLI_COMMAND_FAILED: 'other',
  CLI_EXECUTE_INVOKED: 'execute',
  CLI_EXECUTE_SUCCEEDED: 'execute',
  CLI_EXECUTE_FAILED: 'execute',
  CLI_SEARCH_INVOKED: 'other',
  CLI_SEARCH_SUCCEEDED: 'other',
  CLI_SEARCH_FAILED: 'other',
  CLI_LINK_INVOKED: 'connect',
  CLI_LINK_SUCCEEDED: 'connect',
  CLI_LINK_FAILED: 'connect',
  CLI_LOGIN_INVOKED: 'login',
  CLI_LOGIN_SUCCEEDED: 'login',
  CLI_LOGIN_FAILED: 'login',
  CLI_LOGOUT_INVOKED: 'other',
  CLI_LOGOUT_SUCCEEDED: 'other',
  CLI_LOGOUT_FAILED: 'other',
  CLI_PROXY_INVOKED: 'other',
  CLI_PROXY_SUCCEEDED: 'other',
  CLI_PROXY_FAILED: 'other',
  CLI_RUN_INVOKED: 'other',
  CLI_RUN_SUCCEEDED: 'other',
  CLI_RUN_FAILED: 'other',
  CLI_INSTALL_INVOKED: 'install',
  CLI_INSTALL_SUCCEEDED: 'install',
  CLI_INSTALL_FAILED: 'install',
  CLI_SETUP_INVOKED: 'setup',
  CLI_SETUP_SUCCEEDED: 'setup',
  CLI_SETUP_FAILED: 'setup',
  CLI_SETUP_HOST_DETECTED: 'setup',
  CLI_SETUP_CANCELLED: 'setup',
  CLI_SETUP_SKIPPED: 'setup',
  CLI_PLUGIN_SETUP_SUCCEEDED: 'setup',
  CLI_PLUGIN_SETUP_FAILED: 'setup',
  CLI_PLUGIN_UNINSTALL_SUCCEEDED: 'setup',
  CLI_PLUGIN_HINT_SHOWN: 'setup',
  CLI_TOOL_INVOCATION_VALIDATION_FAILED: 'execute',
  CLI_TOOL_INVOCATION_TOOL_NOT_FOUND: 'execute',
  CLI_TOOL_INVOCATION_FAILED: 'execute',
} as const satisfies Record<CliAnalyticsEventName, CliJourneyStage>;

let cliAnalyticsVersion = APP_VERSION;
let cliChannel = inferSkillReleaseChannel(APP_VERSION);

/**
 * Event builders are synchronous, so the CLI bootstrap injects the version
 * resolved from release-tag.txt before any command can emit telemetry.
 */
export const configureCliAnalyticsReleaseVersion = (version: string): void => {
  cliAnalyticsVersion = version;
  cliChannel = inferSkillReleaseChannel(version);
};

const buildEvent = (
  name: CliAnalyticsEventName,
  properties: Record<string, unknown>
): TrackEvent => ({
  name,
  properties: {
    ...properties,
    ...cliAnalyticsProvenance(
      typeof properties.cli_version === 'string' ? properties.cli_version : cliAnalyticsVersion
    ),
    // Command events can describe offline or mixed work. Do not pretend they
    // each represent one HTTP request.
    execution_channel:
      typeof properties.command_path === 'string' &&
      [
        'execute',
        'search',
        'link',
        'proxy',
        'dev playground-execute',
        'dev toolkits search',
        'dev connected-accounts link',
      ].includes(properties.command_path)
        ? 'tool_router'
        : 'unknown',
    journey_stage: CLI_EVENT_JOURNEY_STAGES[name],
    cli_channel: cliChannel,
  },
});

const TOOL_NOT_FOUND_PATTERN = /\btool\b.*\bnot found\b/i;
const TOOL_VALIDATION_PATTERN = /\b(?:validation|invalid parameter|invalid argument)\b/i;
const TOOL_NOT_FOUND_CODES: ReadonlySet<number> = new Set([
  1147, // MCP_ToolNotFound
  1800, // ActionExecute_ToolNotFound
  2301, // Labs_ToolNotFound
  2306, // Labs_InvalidToolName
  2401, // Tool_ToolNotFound
  3703, // ComposioTools_ToolNotFound
  4301, // ToolRouterV2_ToolNotFound
]);
const TOOL_VALIDATION_CODES: ReadonlySet<number> = new Set([
  1142, // MCP_ValidationError
  1149, // MCP_InvalidParameter
  1607, // Upstream_ValidationError
  3702, // ComposioTools_ValidationError
]);

const argumentShape = (args: Record<string, unknown>) => {
  const keys = Object.keys(args).sort();
  return {
    argument_key_count: keys.length,
    argument_keys: keys.slice(0, 50),
  };
};

const extractIssueLocations = (issues: ReadonlyArray<string>): ReadonlyArray<string> =>
  [
    ...new Set(
      issues
        .map(issue => issue.match(/^([^:]+):/u)?.[1]?.trim())
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ),
  ].slice(0, 20);

const extractUnknownKeys = (issues: ReadonlyArray<string>): ReadonlyArray<string> =>
  [
    ...new Set(
      issues
        .map(issue => issue.match(/Unknown key "([^"]+)"/u)?.[1])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ),
  ].slice(0, 20);

const errorNameOf = (error: unknown): string =>
  error instanceof Error && error.name ? error.name : 'UnknownError';

const failureReasonProperties = (error: unknown) => {
  // `effect/cli` rejected argv: no command ran, and the event's command path is the one the
  // parser reached (`CliError.ShowHelp.commandPath`). A bare group's help carries no errors.
  if (error instanceof CliError.ShowHelp && error.errors.length > 0) {
    return { failure_reason_code: 'parse_error' };
  }
  if (error instanceof SetupCommandError) return { failure_reason_code: error.reasonCode };
  if (error instanceof ChildProcessExited || error instanceof ChildProcessSignaled) {
    return { failure_reason_code: 'child_exit' };
  }
  return {};
};

const commandProperties = (context: CliCommandTelemetryContext) => ({
  ...context.options,
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
});

const parentProperties = (context: CliCommandTelemetryContext) => ({
  ...commandProperties(context),
  parent_run_id: context.parentRunId,
  parent_command: context.parentRunId ? 'run' : undefined,
});

const getExecuteCommandProperties = (context: CliCommandTelemetryContext) => {
  const slug = context.argument;
  return {
    ...parentProperties(context),
    surface: context.commandPath === 'execute' ? 'root' : 'dev',
    tool_slug: slug,
    tool_name: slug,
    toolkit_slug:
      context.toolkitSlug ??
      (typeof slug === 'string' ? guessToolkitFromToolSlug(slug) : undefined),
  };
};

const getLinkCommandProperties = (context: CliCommandTelemetryContext) => ({
  ...parentProperties(context),
  toolkit: context.argument,
});

const getRunCommandProperties = (context: CliCommandTelemetryContext) => ({
  ...commandProperties(context),
  run_id: context.runId,
});

const getSetupCommandProperties = (context: CliCommandTelemetryContext) => ({
  ...commandProperties(context),
  stdout_is_tty: context.stdoutIsTTY,
});

/**
 * Builds the telemetry context of the command `identity` names, with the input `effect/cli`
 * parsed for it (none for help, version, and parse failures).
 *
 * `invocation` is read from config by the caller and stamped here so every synchronous event
 * builder below takes the origin as an input rather than consulting process-wide state.
 */
export const createCliCommandTelemetryContext = (params: {
  readonly argv: ReadonlyArray<string>;
  readonly cliVersion: string;
  readonly terminal: { readonly stdoutIsTTY: boolean; readonly stderrIsTTY: boolean };
  readonly invocation: CliInvocationContext;
  readonly identity: CommandIdentity;
  readonly input: Option.Option<unknown>;
  readonly startedAt: number;
}): CliCommandTelemetryContext => {
  const { argv, invocation, terminal, identity } = params;
  const family = identity.meta.telemetryFamily;
  return {
    argv,
    cliVersion: params.cliVersion,
    invocationOrigin: invocation.invocationOrigin,
    parentRunId: invocation.parentRunId,
    commandPath: commandPathOf(identity),
    family,
    ...Option.getOrElse(
      Option.flatMap(params.input, input =>
        Option.map(Option.fromNullishOr(identity.meta.telemetryInput), project => project(input))
      ),
      () => ({ options: {}, flagNames: [] })
    ),
    stdoutIsTTY: terminal.stdoutIsTTY,
    stderrIsTTY: terminal.stderrIsTTY,
    startedAt: params.startedAt,
    runId: family === 'run' ? (invocation.parentRunId ?? crypto.randomUUID()) : undefined,
  };
};

const getCliCommandInvokedEvent = (context: CliCommandTelemetryContext): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_COMMAND_INVOKED, {
    source: 'cli',
    invocation_origin: context.invocationOrigin,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    flag_names: context.flagNames,
    arg_count: Math.max(0, context.argv.length - 2),
    stdout_is_tty: context.stdoutIsTTY,
    stderr_is_tty: context.stderrIsTTY,
  });

const getCliCommandSucceededEvent = (context: CliCommandTelemetryContext): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_COMMAND_SUCCEEDED, {
    source: 'cli',
    invocation_origin: context.invocationOrigin,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    flag_names: context.flagNames,
  });

const getCliCommandFailedEvent = (
  context: CliCommandTelemetryContext,
  error: unknown
): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_COMMAND_FAILED, {
    source: 'cli',
    invocation_origin: context.invocationOrigin,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    flag_names: context.flagNames,
    error_name: errorNameOf(error),
    ...failureReasonProperties(error),
  });

type SpecialLifecycleFamily = {
  readonly invokedEventName: CliAnalyticsEventName;
  readonly succeededEventName: CliAnalyticsEventName;
  readonly failedEventName: CliAnalyticsEventName;
  readonly getProperties: (context: CliCommandTelemetryContext) => Record<string, unknown>;
};

const SPECIAL_LIFECYCLE_FAMILIES: Record<
  Exclude<TelemetryFamily, 'command'>,
  SpecialLifecycleFamily
> = {
  execute: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_FAILED,
    getProperties: getExecuteCommandProperties,
  },
  search: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_SEARCH_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_SEARCH_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_SEARCH_FAILED,
    getProperties: parentProperties,
  },
  link: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_LINK_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_LINK_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_LINK_FAILED,
    getProperties: getLinkCommandProperties,
  },
  login: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGIN_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_LOGIN_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGIN_FAILED,
    getProperties: commandProperties,
  },
  logout: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGOUT_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_LOGOUT_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGOUT_FAILED,
    getProperties: commandProperties,
  },
  proxy: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_PROXY_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_PROXY_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_PROXY_FAILED,
    getProperties: commandProperties,
  },
  run: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_RUN_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_RUN_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_RUN_FAILED,
    getProperties: getRunCommandProperties,
  },
  install: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_INSTALL_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_INSTALL_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_INSTALL_FAILED,
    getProperties: commandProperties,
  },
  setup: {
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_SETUP_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_SETUP_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_SETUP_FAILED,
    getProperties: getSetupCommandProperties,
  },
};

const getSpecialLifecycleFamily = (
  context: CliCommandTelemetryContext
): SpecialLifecycleFamily | undefined =>
  context.family === 'command' ? undefined : SPECIAL_LIFECYCLE_FAMILIES[context.family];

export const getPrimaryLifecycleInvokedEvent = (
  context: CliCommandTelemetryContext
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context);
  if (!family) {
    return getCliCommandInvokedEvent(context);
  }
  return buildEvent(family.invokedEventName, family.getProperties(context));
};

export const getPrimaryLifecycleSucceededEvent = (
  context: CliCommandTelemetryContext
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context);
  if (!family) {
    return getCliCommandSucceededEvent(context);
  }
  return buildEvent(family.succeededEventName, family.getProperties(context));
};

export const getPrimaryLifecycleFailedEvent = (
  context: CliCommandTelemetryContext,
  error: unknown
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context);
  if (!family) {
    return getCliCommandFailedEvent(context, error);
  }
  return buildEvent(family.failedEventName, {
    ...family.getProperties(context),
    error_name: errorNameOf(error),
    ...failureReasonProperties(error),
  });
};

export const getPluginHintShownEvent = (params: {
  readonly invocationOrigin: string;
  readonly cliVersion: string;
  readonly commandPath: string;
  readonly agentHost: AgentHost;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_PLUGIN_HINT_SHOWN, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    cli_version: params.cliVersion,
    command_path: params.commandPath,
    agent_host: params.agentHost,
  });

export const getPluginLifecycleSucceededEvent = (params: {
  readonly operation: 'setup' | 'uninstall';
  readonly target: 'claude' | 'codex';
  readonly action: 'installed' | 'enabled' | 'configured' | 'uninstalled';
  readonly invocationOrigin: string;
  readonly cliVersion: string;
}): TrackEvent =>
  buildEvent(
    params.operation === 'uninstall'
      ? CLI_ANALYTICS_EVENTS.CLI_PLUGIN_UNINSTALL_SUCCEEDED
      : CLI_ANALYTICS_EVENTS.CLI_PLUGIN_SETUP_SUCCEEDED,
    {
      source: 'cli',
      invocation_origin: params.invocationOrigin,
      cli_version: params.cliVersion,
      command_path: 'setup',
      operation: params.operation,
      agent_host: params.target,
      action: params.action,
    }
  );

export const getPluginLifecycleFailedEvent = (params: {
  readonly operation: 'setup' | 'uninstall';
  readonly target: 'claude' | 'codex';
  readonly phase: 'install' | 'uninstall';
  readonly error: unknown;
  readonly invocationOrigin: string;
  readonly cliVersion: string;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_PLUGIN_SETUP_FAILED, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    cli_version: params.cliVersion,
    command_path: 'setup',
    operation: params.operation,
    agent_host: params.target,
    phase: params.phase,
    error_name: errorNameOf(params.error),
  });

export const getSetupHostDetectedEvent = (params: {
  readonly operation: 'setup' | 'uninstall';
  readonly requestedTarget: 'auto' | 'claude' | 'codex' | 'all';
  readonly target: 'claude' | 'codex';
  readonly available: boolean;
  readonly supported: boolean;
  readonly hostVersion?: string;
  readonly unsupportedReasonCode?:
    'codex_too_old' | 'no_json_inspection' | 'host_command_failed' | 'unknown';
  readonly hostConfigDirPresent?: boolean;
  readonly hostBinaryInKnownPaths?: boolean;
  readonly invocationOrigin: string;
  readonly cliVersion: string;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_SETUP_HOST_DETECTED, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    cli_version: params.cliVersion,
    command_path: 'setup',
    operation: params.operation,
    requested_target: params.requestedTarget,
    agent_host: params.target,
    available: params.available,
    supported: params.supported,
    host_version: params.hostVersion,
    unsupported_reason_code: params.unsupportedReasonCode,
    host_config_dir_present: params.hostConfigDirPresent,
    host_binary_in_known_paths: params.hostBinaryInKnownPaths,
  });

export const getSetupCancelledEvent = (params: {
  readonly operation: 'setup' | 'uninstall';
  readonly requestedTarget: 'auto' | 'claude' | 'codex' | 'all';
  readonly invocationOrigin: string;
  readonly cliVersion: string;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_SETUP_CANCELLED, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    cli_version: params.cliVersion,
    command_path: 'setup',
    operation: params.operation,
    requested_target: params.requestedTarget,
    reason: 'user_declined',
  });

export const getSetupSkippedEvent = (params: {
  readonly operation: 'setup' | 'uninstall';
  readonly requestedTarget: 'auto' | 'claude' | 'codex' | 'all';
  readonly invocationOrigin: string;
  readonly cliVersion: string;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_SETUP_SKIPPED, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    cli_version: params.cliVersion,
    command_path: 'setup',
    operation: params.operation,
    requested_target: params.requestedTarget,
    reason: 'no_host_detected',
  });

export const getToolExecuteValidationFailedEvent = (params: {
  readonly toolSlug: string;
  readonly toolkitSlug?: string;
  readonly args: Record<string, unknown>;
  readonly error: ToolInputValidationError;
  readonly invocationOrigin: string;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'dry_run' | 'validation' | 'execution';
  readonly failureOrigin: 'fast_fail' | 'main_endpoint';
  readonly logId?: string;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_VALIDATION_FAILED, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    tool_slug: params.toolSlug,
    toolkit_slug: params.toolkitSlug ?? guessToolkitFromToolSlug(params.toolSlug),
    surface: params.surface,
    project_mode: params.projectMode,
    stage: params.stage,
    failure_origin: params.failureOrigin,
    tool_log_id: params.logId,
    issue_count: params.error.issues.length,
    issue_locations: extractIssueLocations(params.error.issues),
    unknown_keys: extractUnknownKeys(params.error.issues),
    schema_path: params.error.schemaPath,
    ...argumentShape(params.args),
  });

export const isMaybeToolNotFoundError = (params: {
  readonly message?: string;
  readonly errorSlug?: string;
  readonly status?: number;
  readonly apiCode?: number;
}): boolean => {
  if (typeof params.apiCode === 'number' && TOOL_NOT_FOUND_CODES.has(params.apiCode)) return true;
  if (params.status === 404) return true;
  const errorSlug = params.errorSlug?.toLowerCase() ?? '';
  if (errorSlug.includes('notfound')) return true;
  return TOOL_NOT_FOUND_PATTERN.test(params.message ?? '');
};

export const isMaybeToolValidationError = (params: {
  readonly message?: string;
  readonly errorSlug?: string;
  readonly apiCode?: number;
}): boolean => {
  if (typeof params.apiCode === 'number' && TOOL_VALIDATION_CODES.has(params.apiCode)) return true;
  const errorSlug = params.errorSlug?.toLowerCase() ?? '';
  if (errorSlug.includes('validation') || errorSlug.includes('invalidparameter')) return true;
  return TOOL_VALIDATION_PATTERN.test(params.message ?? '');
};

export const getToolExecuteToolNotFoundEvent = (params: {
  readonly toolSlug: string;
  readonly toolkitSlug?: string;
  readonly args: Record<string, unknown>;
  readonly invocationOrigin: string;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'schema_fetch' | 'dry_run' | 'execution';
  readonly failureOrigin: 'fast_fail' | 'main_endpoint';
  readonly logId?: string;
  readonly errorSlug?: string;
  readonly status?: number;
  readonly apiCode?: number;
  readonly message?: string;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_TOOL_NOT_FOUND, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    tool_slug: params.toolSlug,
    toolkit_slug: params.toolkitSlug ?? guessToolkitFromToolSlug(params.toolSlug),
    surface: params.surface,
    project_mode: params.projectMode,
    stage: params.stage,
    failure_origin: params.failureOrigin,
    tool_log_id: params.logId,
    error_slug: params.errorSlug,
    http_status: params.status,
    api_error_code: params.apiCode,
    ...argumentShape(params.args),
  });

export const getToolExecuteFailedEvent = (params: {
  readonly toolSlug: string;
  readonly toolkitSlug?: string;
  readonly args: Record<string, unknown>;
  readonly invocationOrigin: string;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'schema_fetch' | 'dry_run' | 'execution';
  readonly failureOrigin: 'fast_fail' | 'main_endpoint';
  readonly logId?: string;
  readonly errorSlug?: string;
  readonly status?: number;
  readonly apiCode?: number;
  readonly message?: string;
  readonly errorName?: string;
  readonly isNoConnectionError?: boolean;
}): TrackEvent =>
  buildEvent(CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_FAILED, {
    source: 'cli',
    invocation_origin: params.invocationOrigin,
    tool_slug: params.toolSlug,
    toolkit_slug: params.toolkitSlug ?? guessToolkitFromToolSlug(params.toolSlug),
    surface: params.surface,
    project_mode: params.projectMode,
    stage: params.stage,
    failure_origin: params.failureOrigin,
    tool_log_id: params.logId,
    error_slug: params.errorSlug,
    http_status: params.status,
    api_error_code: params.apiCode,
    error_name: params.errorName,
    is_no_connection_error: Boolean(params.isNoConnectionError),
    ...argumentShape(params.args),
  });
