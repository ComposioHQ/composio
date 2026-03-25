import type { CliCommandTelemetryContext, TrackEvent } from './types';
import { ToolInputValidationError } from 'src/services/tool-input-validation';
import { toolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';

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
  CLI_TOOL_INVOCATION_VALIDATION_FAILED: 'CLI_TOOL_INVOCATION_VALIDATION_FAILED',
  CLI_TOOL_INVOCATION_TOOL_NOT_FOUND: 'CLI_TOOL_INVOCATION_TOOL_NOT_FOUND',
  CLI_TOOL_INVOCATION_FAILED: 'CLI_TOOL_INVOCATION_FAILED',
} as const;

const KNOWN_COMMAND_TOKENS = new Set([
  'version',
  'upgrade',
  'whoami',
  'login',
  'logout',
  'run',
  'install',
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
const getInvocationOrigin = (): string => process.env.COMPOSIO_CLI_INVOCATION_ORIGIN ?? 'cli';
const getParentRunId = (): string | undefined => process.env.COMPOSIO_CLI_PARENT_RUN_ID;

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

const errorMessageOf = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  if (typeof error === 'string') return error.slice(0, 500);
  return 'Unknown error';
};

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
    invocation_origin: getInvocationOrigin(),
    parent_run_id: getParentRunId(),
    parent_command: getParentRunId() ? 'run' : undefined,
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    surface: context.commandPath === 'execute' ? 'root' : 'dev',
    tool_slug: slug,
    tool_name: slug,
    toolkit_slug: typeof slug === 'string' ? toolkitFromToolSlug(slug) : undefined,
    dry_run: isFlagPresent(context.argv, '--dry-run'),
    get_schema: isFlagPresent(context.argv, '--get-schema'),
    has_data: isFlagPresent(context.argv, '--data', '-d'),
    skip_connection_check: isFlagPresent(context.argv, '--skip-connection-check'),
    skip_tool_params_check: isFlagPresent(context.argv, '--skip-tool-params-check'),
    no_verify: isFlagPresent(context.argv, '--no-verify'),
  };
};

const getSearchCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: getInvocationOrigin(),
  parent_run_id: getParentRunId(),
  parent_command: getParentRunId() ? 'run' : undefined,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  query: getTrailingPositionals(context)[0],
  search_query: getTrailingPositionals(context)[0],
  toolkits: getFlagValue(context.argv, '--toolkits'),
  limit: getFlagValue(context.argv, '--limit'),
});

const getLinkCommandProperties = (context: CliCommandTelemetryContext) => {
  const firstPositional = getTrailingPositionals(context)[0];
  return {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    parent_run_id: getParentRunId(),
    parent_command: getParentRunId() ? 'run' : undefined,
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
  invocation_origin: getInvocationOrigin(),
  run_id: context.runId,
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  debug: isFlagPresent(context.argv, '--debug'),
  dry_run: isFlagPresent(context.argv, '--dry-run'),
  skip_connection_check: isFlagPresent(context.argv, '--skip-connection-check'),
  skip_tool_params_check: isFlagPresent(context.argv, '--skip-tool-params-check'),
  no_verify: isFlagPresent(context.argv, '--no-verify'),
  file_mode: isFlagPresent(context.argv, '--file', '-f'),
  arg_count: Math.max(0, context.argv.length - 3),
});

const getLoginCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: getInvocationOrigin(),
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
  invocation_origin: getInvocationOrigin(),
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
});

const getProxyCommandProperties = (context: CliCommandTelemetryContext) => ({
  source: 'cli',
  invocation_origin: getInvocationOrigin(),
  cli_version: context.cliVersion,
  command_path: context.commandPath,
  duration_ms: Date.now() - context.startedAt,
  endpoint: getTrailingPositionals(context)[0],
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

const isGenericOnlyCommand = (commandPath: string): boolean =>
  commandPath === 'composio' || commandPath.startsWith('dev');

export const createCliCommandTelemetryContext = (
  argv: ReadonlyArray<string>,
  cliVersion: string
): CliCommandTelemetryContext => ({
  argv,
  cliVersion,
  commandPath: extractCommandPath(argv),
  flagNames: extractFlagNames(argv),
  startedAt: Date.now(),
  runId:
    extractCommandPath(argv) === 'run'
      ? (process.env.COMPOSIO_CLI_PARENT_RUN_ID ?? crypto.randomUUID())
      : undefined,
});

const getCliCommandInvokedEvent = (context: CliCommandTelemetryContext): TrackEvent => ({
  name: CLI_ANALYTICS_EVENTS.CLI_COMMAND_INVOKED,
  properties: {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    flag_names: context.flagNames,
    arg_count: Math.max(0, context.argv.length - 2),
    stdout_is_tty: Boolean(process.stdout.isTTY),
    stderr_is_tty: Boolean(process.stderr.isTTY),
  },
});

const getCliCommandSucceededEvent = (context: CliCommandTelemetryContext): TrackEvent => ({
  name: CLI_ANALYTICS_EVENTS.CLI_COMMAND_SUCCEEDED,
  properties: {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    flag_names: context.flagNames,
  },
});

const getCliCommandFailedEvent = (
  context: CliCommandTelemetryContext,
  error: unknown
): TrackEvent => ({
  name: CLI_ANALYTICS_EVENTS.CLI_COMMAND_FAILED,
  properties: {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    cli_version: context.cliVersion,
    command_path: context.commandPath,
    duration_ms: Date.now() - context.startedAt,
    flag_names: context.flagNames,
    error_name: errorNameOf(error),
    error_message: errorMessageOf(error),
  },
});

type SpecialLifecycleFamily = {
  readonly match: (commandPath: string) => boolean;
  readonly invokedEventName: string;
  readonly succeededEventName: string;
  readonly failedEventName: string;
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
  return {
    name: family.invokedEventName,
    properties: family.getProperties(context),
  };
};

export const getPrimaryLifecycleSucceededEvent = (
  context: CliCommandTelemetryContext
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context.commandPath);
  if (!family || isGenericOnlyCommand(context.commandPath)) {
    return getCliCommandSucceededEvent(context);
  }
  return {
    name: family.succeededEventName,
    properties: family.getProperties(context),
  };
};

export const getPrimaryLifecycleFailedEvent = (
  context: CliCommandTelemetryContext,
  error: unknown
): TrackEvent => {
  const family = getSpecialLifecycleFamily(context.commandPath);
  if (!family || isGenericOnlyCommand(context.commandPath)) {
    return getCliCommandFailedEvent(context, error);
  }
  return {
    name: family.failedEventName,
    properties: {
      ...family.getProperties(context),
      error_name: errorNameOf(error),
      error_message: errorMessageOf(error),
    },
  };
};

export const getToolExecuteValidationFailedEvent = (params: {
  readonly toolSlug: string;
  readonly args: Record<string, unknown>;
  readonly error: ToolInputValidationError;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'dry_run' | 'validation' | 'execution';
}): TrackEvent => ({
  name: CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_VALIDATION_FAILED,
  properties: {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    tool_slug: params.toolSlug,
    toolkit_slug: toolkitFromToolSlug(params.toolSlug),
    surface: params.surface,
    project_mode: params.projectMode,
    stage: params.stage,
    issue_count: params.error.issues.length,
    issue_locations: extractIssueLocations(params.error.issues),
    unknown_keys: extractUnknownKeys(params.error.issues),
    schema_path: params.error.schemaPath,
    ...argumentShape(params.args),
  },
});

export const isMaybeToolNotFoundError = (params: {
  readonly message?: string;
  readonly errorSlug?: string;
  readonly status?: number;
}): boolean =>
  params.status === 404 ||
  params.errorSlug?.toLowerCase().includes('notfound') === true ||
  TOOL_NOT_FOUND_PATTERN.test(params.message ?? '');

export const getToolExecuteToolNotFoundEvent = (params: {
  readonly toolSlug: string;
  readonly args: Record<string, unknown>;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'schema_fetch' | 'dry_run' | 'execution';
  readonly errorSlug?: string;
  readonly status?: number;
  readonly apiCode?: number;
  readonly message?: string;
}): TrackEvent => ({
  name: CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_TOOL_NOT_FOUND,
  properties: {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    tool_slug: params.toolSlug,
    toolkit_slug: toolkitFromToolSlug(params.toolSlug),
    surface: params.surface,
    project_mode: params.projectMode,
    stage: params.stage,
    error_slug: params.errorSlug,
    http_status: params.status,
    api_error_code: params.apiCode,
    error_message: params.message?.slice(0, 500),
    ...argumentShape(params.args),
  },
});

export const getToolExecuteFailedEvent = (params: {
  readonly toolSlug: string;
  readonly args: Record<string, unknown>;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'schema_fetch' | 'dry_run' | 'execution';
  readonly errorSlug?: string;
  readonly status?: number;
  readonly apiCode?: number;
  readonly message?: string;
  readonly errorName?: string;
  readonly isNoConnectionError?: boolean;
}): TrackEvent => ({
  name: CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_FAILED,
  properties: {
    source: 'cli',
    invocation_origin: getInvocationOrigin(),
    tool_slug: params.toolSlug,
    toolkit_slug: toolkitFromToolSlug(params.toolSlug),
    surface: params.surface,
    project_mode: params.projectMode,
    stage: params.stage,
    error_slug: params.errorSlug,
    http_status: params.status,
    api_error_code: params.apiCode,
    error_name: params.errorName,
    error_message: params.message?.slice(0, 500),
    is_no_connection_error: Boolean(params.isNoConnectionError),
    ...argumentShape(params.args),
  },
});
