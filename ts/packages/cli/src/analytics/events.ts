import type { CliCommandTelemetryContext, TrackEvent } from './types';
import { APP_VERSION } from 'src/constants';
import { inferSkillReleaseChannel } from 'src/effects/install-skill';
import type { CliInvocationContext } from 'src/services/runtime-cli-context';
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
  CLI_TOOL_INVOCATION_VALIDATION_FAILED: 'execute',
  CLI_TOOL_INVOCATION_TOOL_NOT_FOUND: 'execute',
  CLI_TOOL_INVOCATION_FAILED: 'execute',
} as const satisfies Record<CliAnalyticsEventName, CliJourneyStage>;

let cliChannel = inferSkillReleaseChannel(APP_VERSION);

/**
 * Event builders are synchronous, so the CLI bootstrap injects the version
 * resolved from release-tag.txt before any command can emit telemetry.
 */
export const configureCliAnalyticsReleaseVersion = (version: string): void => {
  cliChannel = inferSkillReleaseChannel(version);
};

const buildEvent = (
  name: CliAnalyticsEventName,
  properties: Record<string, unknown>
): TrackEvent => ({
  name,
  properties: {
    ...properties,
    journey_stage: CLI_EVENT_JOURNEY_STAGES[name],
    cli_channel: cliChannel,
  },
});

const KNOWN_COMMAND_TOKENS = new Set([
  'version',
  'upgrade',
  'whoami',
  'login',
  'logout',
  'run',
  'install',
  'setup',
  'dev',
  'generate',
  'tools',
  'toolkits',
  'toolkit',
  'search',
  'execute',
  'playground-execute',
  'link',
  'proxy',
  'artifacts',
  'cwd',
  'connected-accounts',
  'auth-configs',
  'triggers',
  'logs',
  'orgs',
  'projects',
  'info',
  'list',
  'create',
  'delete',
  'enable',
  'disable',
  'status',
  'listen',
  'switch',
  'py',
  'ts',
]);

const TOOL_NOT_FOUND_PATTERN = /\btool\b.*\bnot found\b/i;
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

const extractCommandPath = (argv: ReadonlyArray<string>): string => {
  const commandTokens: string[] = [];

  for (const token of argv.slice(2)) {
    if (!token || token.startsWith('-') || !KNOWN_COMMAND_TOKENS.has(token)) {
      break;
    }
    commandTokens.push(token);
  }

  return commandTokens.length > 0 ? commandTokens.join(' ') : 'composio';
};

const extractFlagNames = (argv: ReadonlyArray<string>): ReadonlyArray<string> =>
  [
    ...new Set(
      argv
        .slice(2)
        .filter(token => token.startsWith('-'))
        .map(token => token.split('=')[0]!)
    ),
  ].sort();

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

const isFlagPresent = (argv: ReadonlyArray<string>, ...flags: string[]): boolean =>
  argv.slice(2).some(token => {
    if (flags.includes(token)) return true;
    return flags.some(flag => token.startsWith(`${flag}=`));
  });

const getFlagValue = (argv: ReadonlyArray<string>, ...flags: string[]): string | undefined => {
  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) continue;

    for (const flag of flags) {
      if (token === flag) {
        const next = args[index + 1];
        return next && !next.startsWith('-') ? next : undefined;
      }
      if (token.startsWith(`${flag}=`)) {
        return token.slice(flag.length + 1);
      }
    }
  }
  return undefined;
};

const getTrailingPositionals = (context: CliCommandTelemetryContext): ReadonlyArray<string> => {
  const commandTokenCount =
    context.commandPath === 'composio' ? 0 : context.commandPath.split(' ').length;
  const args = context.argv.slice(2 + commandTokenCount);
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) continue;

    if (token === '--') {
      break;
    }

    if (token.startsWith('-')) {
      const expectsValue = [
        '--data',
        '-d',
        '--toolkits',
        '--limit',
        '--user-id',
        '--project-name',
        '--auth-config',
        '--file',
        '-f',
      ].includes(token);
      if (expectsValue) {
        index += 1;
      }
      continue;
    }

    positionals.push(token);
  }

  return positionals;
};

const getExecuteCommandProperties = (context: CliCommandTelemetryContext) => {
  const slug = getTrailingPositionals(context)[0];
  return {
    source: 'cli',
    invocation_origin: context.invocationOrigin,
    parent_run_id: context.parentRunId,
    parent_command: context.parentRunId ? 'run' : undefined,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    surface: context.commandPath === 'execute' ? 'root' : 'dev',
    tool_slug: slug,
    tool_name: slug,
    toolkit_slug:
      context.toolkitSlug ??
      (typeof slug === 'string' ? guessToolkitFromToolSlug(slug) : undefined),
    dry_run: isFlagPresent(context.argv, '--dry-run'),
    get_schema: isFlagPresent(context.argv, '--get-schema'),
    has_data: isFlagPresent(context.argv, '--data', '-d'),
    skip_connection_check: isFlagPresent(context.argv, '--skip-connection-check'),
    skip_tool_params_check: isFlagPresent(context.argv, '--skip-tool-params-check'),
    skip_checks: isFlagPresent(context.argv, '--skip-checks'),
  };
};

// Search queries are user-authored free text, so only their shape is recorded.
const getSearchCommandProperties = (context: CliCommandTelemetryContext) => {
  const query = getTrailingPositionals(context)[0] ?? '';
  return {
    source: 'cli',
    invocation_origin: context.invocationOrigin,
    parent_run_id: context.parentRunId,
    parent_command: context.parentRunId ? 'run' : undefined,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    query_length: query.length,
    query_term_count: query.split(/\s+/u).filter(Boolean).length,
    toolkits: getFlagValue(context.argv, '--toolkits'),
    limit: getFlagValue(context.argv, '--limit'),
  };
};

const getLinkCommandProperties = (context: CliCommandTelemetryContext) => {
  const firstPositional = getTrailingPositionals(context)[0];
  return {
    source: 'cli',
    invocation_origin: context.invocationOrigin,
    parent_run_id: context.parentRunId,
    parent_command: context.parentRunId ? 'run' : undefined,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    toolkit: getFlagValue(context.argv, '--toolkit') ?? firstPositional,
    no_browser: isFlagPresent(context.argv, '--no-browser'),
    no_wait: isFlagPresent(context.argv, '--no-wait'),
    has_auth_config: isFlagPresent(context.argv, '--auth-config'),
  };
};

const getRunCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  run_id: context.runId,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  debug: isFlagPresent(context.argv, '--debug'),
  dry_run: isFlagPresent(context.argv, '--dry-run'),
  skip_connection_check: isFlagPresent(context.argv, '--skip-connection-check'),
  skip_tool_params_check: isFlagPresent(context.argv, '--skip-tool-params-check'),
  skip_checks: isFlagPresent(context.argv, '--skip-checks'),
  file_mode: isFlagPresent(context.argv, '--file', '-f'),
  arg_count: Math.max(0, context.argv.length - 3),
});

const getInstallCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  completions: isFlagPresent(context.argv, '--completions'),
  no_completions: isFlagPresent(context.argv, '--no-completions'),
});

const getSetupCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  operation: isFlagPresent(context.argv, '--uninstall') ? 'uninstall' : 'setup',
  target: getFlagValue(context.argv, '--target') ?? 'auto',
  yes: isFlagPresent(context.argv, '--yes', '-y'),
  if_present: isFlagPresent(context.argv, '--if-present'),
  stdout_is_tty: context.stdoutIsTTY,
});

const getLoginCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  no_browser: isFlagPresent(context.argv, '--no-browser'),
  no_wait: isFlagPresent(context.argv, '--no-wait'),
  has_key: isFlagPresent(context.argv, '--key'),
  skip_org_picker: isFlagPresent(context.argv, '--yes', '-y'),
});

const getLogoutCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
});

const getProxyCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: context.invocationOrigin,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  has_endpoint: typeof getTrailingPositionals(context)[0] === 'string',
  toolkit: getFlagValue(context.argv, '--toolkit', '-t'),
  method: getFlagValue(context.argv, '--method', '-X') ?? 'GET',
  has_data: isFlagPresent(context.argv, '--data', '-d'),
  header_count: context.argv.slice(2).filter(token => token === '--header' || token === '-H')
    .length,
  skip_connection_check: isFlagPresent(context.argv, '--skip-connection-check'),
});

const isExecuteCommand = (commandPath: string): boolean =>
  commandPath === 'execute' || commandPath === 'dev playground-execute';

const isSearchCommand = (commandPath: string): boolean =>
  commandPath === 'search' || commandPath === 'dev toolkits search';

const isLinkCommand = (commandPath: string): boolean =>
  commandPath === 'link' || commandPath === 'dev connected-accounts link';

const isLoginCommand = (commandPath: string): boolean => commandPath === 'login';

const isLogoutCommand = (commandPath: string): boolean => commandPath === 'logout';

const isProxyCommand = (commandPath: string): boolean => commandPath === 'proxy';

const isRunCommand = (commandPath: string): boolean => commandPath === 'run';

const isInstallCommand = (commandPath: string): boolean => commandPath === 'install';

const isSetupCommand = (commandPath: string): boolean => commandPath === 'setup';

const isGenericOnlyCommand = (commandPath: string): boolean =>
  commandPath === 'composio' || commandPath.startsWith('dev');

/**
 * Tool slug positional of an execute-family invocation, so the CLI bootstrap
 * can resolve the toolkit slug once and stamp it on the telemetry context for
 * the synchronous lifecycle event builders.
 */
export const getExecuteCommandToolSlug = (
  context: CliCommandTelemetryContext
): string | undefined =>
  isExecuteCommand(context.commandPath) ? getTrailingPositionals(context)[0] : undefined;

/**
 * Builds the telemetry context of the running command.
 *
 * `invocation` is read from config by the caller and stamped here so every synchronous event
 * builder below takes the origin as an input rather than consulting process-wide state.
 */
export const createCliCommandTelemetryContext = (
  argv: ReadonlyArray<string>,
  cliVersion: string,
  terminal: { readonly stdoutIsTTY: boolean; readonly stderrIsTTY: boolean },
  invocation: CliInvocationContext
): CliCommandTelemetryContext => ({
  argv,
  cliVersion,
  invocationOrigin: invocation.invocationOrigin,
  parentRunId: invocation.parentRunId,
  commandPath: extractCommandPath(argv),
  flagNames: extractFlagNames(argv),
  stdoutIsTTY: terminal.stdoutIsTTY,
  stderrIsTTY: terminal.stderrIsTTY,
  startedAt: Date.now(),
  runId:
    extractCommandPath(argv) === 'run'
      ? (invocation.parentRunId ?? crypto.randomUUID())
      : undefined,
});

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
  });

type SpecialLifecycleFamily = {
  readonly match: (commandPath: string) => boolean;
  readonly invokedEventName: CliAnalyticsEventName;
  readonly succeededEventName: CliAnalyticsEventName;
  readonly failedEventName: CliAnalyticsEventName;
  readonly getProperties: (context: CliCommandTelemetryContext) => Record<string, unknown>;
};

const SPECIAL_LIFECYCLE_FAMILIES: ReadonlyArray<SpecialLifecycleFamily> = [
  {
    match: isExecuteCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_FAILED,
    getProperties: getExecuteCommandProperties,
  },
  {
    match: isSearchCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_SEARCH_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_SEARCH_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_SEARCH_FAILED,
    getProperties: getSearchCommandProperties,
  },
  {
    match: isLinkCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_LINK_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_LINK_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_LINK_FAILED,
    getProperties: getLinkCommandProperties,
  },
  {
    match: isLoginCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGIN_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_LOGIN_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGIN_FAILED,
    getProperties: getLoginCommandProperties,
  },
  {
    match: isLogoutCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGOUT_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_LOGOUT_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_LOGOUT_FAILED,
    getProperties: getLogoutCommandProperties,
  },
  {
    match: isProxyCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_PROXY_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_PROXY_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_PROXY_FAILED,
    getProperties: getProxyCommandProperties,
  },
  {
    match: isRunCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_RUN_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_RUN_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_RUN_FAILED,
    getProperties: getRunCommandProperties,
  },
  {
    match: isInstallCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_INSTALL_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_INSTALL_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_INSTALL_FAILED,
    getProperties: getInstallCommandProperties,
  },
  {
    match: isSetupCommand,
    invokedEventName: CLI_ANALYTICS_EVENTS.CLI_SETUP_INVOKED,
    succeededEventName: CLI_ANALYTICS_EVENTS.CLI_SETUP_SUCCEEDED,
    failedEventName: CLI_ANALYTICS_EVENTS.CLI_SETUP_FAILED,
    getProperties: getSetupCommandProperties,
  },
];

const getSpecialLifecycleFamily = (commandPath: string): SpecialLifecycleFamily | undefined =>
  SPECIAL_LIFECYCLE_FAMILIES.find(family => family.match(commandPath));

export const getPrimaryLifecycleInvokedEvent = (
  context: CliCommandTelemetryContext
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context.commandPath);
  if (!family || isGenericOnlyCommand(context.commandPath)) {
    return getCliCommandInvokedEvent(context);
  }
  return buildEvent(family.invokedEventName, family.getProperties(context));
};

export const getPrimaryLifecycleSucceededEvent = (
  context: CliCommandTelemetryContext
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context.commandPath);
  if (!family || isGenericOnlyCommand(context.commandPath)) {
    return getCliCommandSucceededEvent(context);
  }
  return buildEvent(family.succeededEventName, family.getProperties(context));
};

export const getPrimaryLifecycleFailedEvent = (
  context: CliCommandTelemetryContext,
  error: unknown
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context.commandPath);
  if (!family || isGenericOnlyCommand(context.commandPath)) {
    return getCliCommandFailedEvent(context, error);
  }
  return buildEvent(family.failedEventName, {
    ...family.getProperties(context),
    error_name: errorNameOf(error),
  });
};

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
}): boolean =>
  (typeof params.apiCode === 'number' && TOOL_NOT_FOUND_CODES.has(params.apiCode)) ||
  params.status === 404 ||
  params.errorSlug?.toLowerCase().includes('notfound') === true ||
  TOOL_NOT_FOUND_PATTERN.test(params.message ?? '');

export const isMaybeToolValidationError = (params: {
  readonly message?: string;
  readonly errorSlug?: string;
  readonly apiCode?: number;
}): boolean =>
  (typeof params.apiCode === 'number' && TOOL_VALIDATION_CODES.has(params.apiCode)) ||
  params.errorSlug?.toLowerCase().includes('validation') === true ||
  params.errorSlug?.toLowerCase().includes('invalidparameter') === true ||
  /\bvalidation\b/i.test(params.message ?? '') ||
  /\binvalid parameter\b/i.test(params.message ?? '') ||
  /\binvalid argument\b/i.test(params.message ?? '');

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
