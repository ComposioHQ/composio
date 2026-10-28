import { VERSION as clientLibraryVersion } from '@composio/client/effect';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as tempy from 'tempy';
import { it } from '@effect/vitest';
import { afterEach, describe, expect, vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Effect, Layer, Option } from 'effect';
import { CliError } from 'effect/cli';
import { createCliCodactFailureBody } from 'src/analytics/dispatch';
import {
  CLI_ANALYTICS_EVENTS,
  CLI_EVENT_JOURNEY_STAGES,
  CLI_JOURNEY_STAGES,
  configureCliAnalyticsReleaseVersion,
  getPluginHintShownEvent,
  getPluginLifecycleFailedEvent,
  getPluginLifecycleSucceededEvent,
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
  getSetupCancelledEvent,
  getSetupHostDetectedEvent,
  getSetupSkippedEvent,
  getToolExecuteFailedEvent,
  getToolExecuteToolNotFoundEvent,
  getToolExecuteValidationFailedEvent,
  isMaybeToolNotFoundError,
  isMaybeToolValidationError,
} from 'src/analytics/events';
import { MissingActingUserError } from 'src/commands/surface';
import { APP_VERSION } from 'src/constants';
import { inferSkillReleaseChannel } from 'src/effects/install-skill';
import { CLI_RELEASE_CHANNELS } from 'src/experimental-features';
import {
  DEFAULT_CLI_INVOCATION_ORIGIN,
  type CliInvocationContext,
} from 'src/services/runtime-cli-context';
import { ChildProcessExited } from 'src/effects/child-process-exited';
import { SetupCommandError } from 'src/services/setup-command-error';
import { ToolInputValidationError } from 'src/services/tool-input-validation';
import { resolveInstalledCliVersion } from 'src/services/run-companion-modules';
import type { TelemetryFamily } from 'src/analytics/types';
import { commandTelemetryContext } from 'test/__utils__/telemetry-context';

const CLI_INVOCATION = {
  invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
  parentRunId: undefined,
} as const;

/** The context of `args` with this file's defaults: the package version, `cli` origin. */
const commandContext = (
  args: ReadonlyArray<string>,
  options: Parameters<typeof commandTelemetryContext>[1]
) => commandTelemetryContext(args, { cliVersion: APP_VERSION, ...options });

describe('CLI analytics execute failure events', () => {
  it('records terminal capabilities supplied by the terminal service', () => {
    const context = commandContext([], {
      path: [],
      cliVersion: '0.3.0',
      terminal: { stdoutIsTTY: true, stderrIsTTY: false },
    });

    const event = getPrimaryLifecycleInvokedEvent(context);

    expect(event?.properties).toMatchObject({
      stdout_is_tty: true,
      stderr_is_tty: false,
    });
  });

  it('keeps CLI product and installed library separate on tool-router command events', () => {
    const context = commandContext(['execute', 'GITHUB_GET_ME'], {
      path: ['execute'],
      family: 'execute',
      input: { slug: 'GITHUB_GET_ME' },
      cliVersion: '0.4.2',
    });
    expect(getPrimaryLifecycleSucceededEvent(context)?.properties).toMatchObject({
      client_name: '@composio/cli',
      client_version: '0.4.2',
      client_library: '@composio/client',
      client_library_version: clientLibraryVersion,
      execution_channel: 'tool_router',
      duration_ms: expect.any(Number),
    });
  });

  it('marks cached-schema validation failures as fast_fail', () => {
    const error = new ToolInputValidationError({
      toolSlug: 'GMAIL_SEND_EMAIL',
      schemaPath: '/tmp/schema.json',
      issues: ['Unknown key "recipient"'],
    });

    const event = getToolExecuteValidationFailedEvent({
      toolSlug: 'GMAIL_SEND_EMAIL',
      args: { recipient: 'a@example.com' },
      error,
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      surface: 'root',
      projectMode: 'consumer',
      stage: 'validation',
      failureOrigin: 'fast_fail',
    });

    expect(event).not.toBeNull();
    expect(event!.properties?.failure_origin).toBe('fast_fail');
    expect(event!.properties?.tool_log_id).toBeUndefined();
  });

  it('marks endpoint tool-not-found failures as main_endpoint and keeps log id', () => {
    const event = getToolExecuteToolNotFoundEvent({
      toolSlug: 'FAKE_TOOL',
      args: {},
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      surface: 'root',
      projectMode: 'consumer',
      stage: 'execution',
      failureOrigin: 'main_endpoint',
      logId: 'log_123',
      message: 'Tool not found',
      status: 404,
    });

    expect(event).not.toBeNull();
    expect(event!.properties?.failure_origin).toBe('main_endpoint');
    expect(event!.properties?.tool_log_id).toBe('log_123');
  });

  it('marks endpoint execution failures as main_endpoint and keeps log id', () => {
    const event = getToolExecuteFailedEvent({
      toolSlug: 'GMAIL_SEND_EMAIL',
      args: { to: 'a@example.com' },
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      surface: 'root',
      projectMode: 'consumer',
      stage: 'execution',
      failureOrigin: 'main_endpoint',
      logId: 'log_456',
      message: 'Invalid tool arguments',
    });

    expect(event).not.toBeNull();
    expect(event!.properties?.failure_origin).toBe('main_endpoint');
    expect(event!.properties?.tool_log_id).toBe('log_456');
  });

  it('classifies known Hermes tool-not-found codes', () => {
    expect(
      isMaybeToolNotFoundError({
        apiCode: 2306,
        message: 'random',
      })
    ).toBe(true);
    expect(
      isMaybeToolNotFoundError({
        apiCode: 3703,
        message: 'random',
      })
    ).toBe(true);
  });

  it('classifies known Hermes validation codes', () => {
    expect(
      isMaybeToolValidationError({
        apiCode: 3702,
        message: 'random',
      })
    ).toBe(true);
    expect(
      isMaybeToolValidationError({
        apiCode: 1149,
        message: 'random',
      })
    ).toBe(true);
  });

  it('builds the CLI codact failure body using backend field names', () => {
    const body = createCliCodactFailureBody({
      failureType: 'wrong_tool_slug',
      toolInfo: {
        toolkit: 'github',
      },
      ctx: {
        invalid_tool_slug: 'GITHUB_MAKE_ISSUE',
      },
      session: {
        command_path: 'execute',
      },
      requestId: 'req_123',
    });

    expect(body).toMatchObject({
      failure_type: 'wrong_tool_slug',
      tool_info: {
        toolkit: 'github',
      },
      ctx: {
        invalid_tool_slug: 'GITHUB_MAKE_ISSUE',
      },
      session: {
        source: 'cli',
        command_path: 'execute',
        cli_version: expect.any(String),
      },
      request_id: 'req_123',
    });
  });
});

describe('CLI analytics setup and install lifecycle events', () => {
  it('tracks setup as a dedicated lifecycle with safe option properties', () => {
    const context = commandContext(['setup', '--target', 'codex', '--uninstall', '--yes'], {
      path: ['setup'],
      family: 'setup',
      input: {},
    });

    const invoked = getPrimaryLifecycleInvokedEvent(context);
    const succeeded = getPrimaryLifecycleSucceededEvent(context);
    const failed = getPrimaryLifecycleFailedEvent(context, new Error('native failure'));

    expect(invoked?.name).toBe(CLI_ANALYTICS_EVENTS.CLI_SETUP_INVOKED);
    expect(succeeded?.name).toBe(CLI_ANALYTICS_EVENTS.CLI_SETUP_SUCCEEDED);
    expect(failed?.name).toBe(CLI_ANALYTICS_EVENTS.CLI_SETUP_FAILED);
    expect(invoked?.properties).toMatchObject({
      command_path: 'setup',
      operation: 'uninstall',
      target: 'codex',
      yes: true,
      if_present: false,
      stdout_is_tty: expect.any(Boolean),
    });
  });

  it('tracks shell installation separately from plugin setup', () => {
    const context = commandContext(['install', '--completions'], {
      path: ['install'],
      family: 'install',
      input: {},
    });

    expect(getPrimaryLifecycleInvokedEvent(context)).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_INSTALL_INVOKED,
      properties: {
        command_path: 'install',
        completions: true,
        no_completions: false,
      },
    });
  });

  it('summarizes user-controlled search and proxy input without recording it', () => {
    const endpoint = 'https://user:password@example.com/private?token=small';
    const search = getPrimaryLifecycleInvokedEvent(
      commandContext(['search', 'customer@example.com secret'], {
        path: ['search'],
        family: 'search',
        input: { query: ['customer@example.com secret'] },
      })
    );
    const proxy = getPrimaryLifecycleInvokedEvent(
      commandContext(['proxy', endpoint], { path: ['proxy'], family: 'proxy', input: { endpoint } })
    );

    expect(search?.properties).toMatchObject({
      query_length: 'customer@example.com secret'.length,
      query_term_count: 2,
    });
    expect(search?.properties).not.toHaveProperty('query');
    expect(search?.properties).not.toHaveProperty('search_query');
    expect(proxy?.properties).toMatchObject({ has_endpoint: true });
    expect(proxy?.properties).not.toHaveProperty('endpoint');
  });

  it('tracks a verified per-host plugin change', () => {
    expect(
      getPluginLifecycleSucceededEvent({
        operation: 'setup',
        target: 'claude',
        action: 'installed',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })
    ).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_PLUGIN_SETUP_SUCCEEDED,
      properties: {
        command_path: 'setup',
        operation: 'setup',
        agent_host: 'claude',
        action: 'installed',
      },
    });
  });
});

describe('CLI analytics setup runtime-context events', () => {
  it('tracks a detected and supported host with its version', () => {
    expect(
      getSetupHostDetectedEvent({
        operation: 'setup',
        requestedTarget: 'auto',
        target: 'claude',
        available: true,
        supported: true,
        hostVersion: '2.1.0',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })
    ).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_SETUP_HOST_DETECTED,
      properties: {
        source: 'cli',
        command_path: 'setup',
        operation: 'setup',
        requested_target: 'auto',
        agent_host: 'claude',
        available: true,
        supported: true,
        host_version: '2.1.0',
        unsupported_reason_code: undefined,
      },
    });
  });

  it('records host presence signals only for an undetected host', () => {
    const missing = getSetupHostDetectedEvent({
      operation: 'setup',
      requestedTarget: 'auto',
      target: 'codex',
      available: false,
      supported: false,
      hostConfigDirPresent: true,
      hostBinaryInKnownPaths: false,
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      cliVersion: APP_VERSION,
    });
    expect(missing?.properties).toMatchObject({
      agent_host: 'codex',
      available: false,
      host_config_dir_present: true,
      host_binary_in_known_paths: false,
    });

    const detected = getSetupHostDetectedEvent({
      operation: 'setup',
      requestedTarget: 'auto',
      target: 'claude',
      available: true,
      supported: true,
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      cliVersion: APP_VERSION,
    });
    expect(detected?.properties?.host_config_dir_present).toBeUndefined();
    expect(detected?.properties?.host_binary_in_known_paths).toBeUndefined();
  });

  it('tracks a printed plugin hint as a setup-stage event', () => {
    expect(
      getPluginHintShownEvent({
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
        commandPath: 'whoami',
        agentHost: 'claude',
      })
    ).toEqual({
      name: CLI_ANALYTICS_EVENTS.CLI_PLUGIN_HINT_SHOWN,
      properties: {
        source: 'cli',
        invocation_origin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cli_version: APP_VERSION,
        command_path: 'whoami',
        agent_host: 'claude',
        client_name: '@composio/cli',
        client_version: APP_VERSION,
        client_language: 'typescript',
        client_runtime: 'nodejs',
        client_runtime_version: process.versions.node,
        client_library: '@composio/client',
        client_library_version: clientLibraryVersion,
        client_framework: 'cli',
        execution_channel: 'unknown',
        journey_stage: 'setup',
        cli_channel: inferSkillReleaseChannel(APP_VERSION),
      },
    });
  });

  // Execute, search, link, connections, listen and proxy each used to report their own class.
  it.each([
    { path: ['execute'], family: 'execute' },
    { path: ['search'], family: 'search' },
    { path: ['link'], family: 'link' },
    { path: ['connections', 'list'], family: 'command' },
    { path: ['listen'], family: 'command' },
    { path: ['proxy'], family: 'proxy' },
  ] as const)('reports a missing user on `$path` as MissingActingUserError', ({ path, family }) => {
    const context = commandContext(path, { path, family });
    const error = new MissingActingUserError({
      tree: 'root',
      projectName: Option.none(),
      message: 'Missing consumer user id. Run `composio login` and try again.',
    });

    expect(getPrimaryLifecycleFailedEvent(context, error)?.properties).toMatchObject({
      error_name: 'commands/MissingActingUserError',
    });
  });

  it('records the setup failure reason code carried by SetupCommandError', () => {
    const context = commandContext(['setup'], { path: ['setup'], family: 'setup', input: {} });
    const error = new SetupCommandError({
      message: 'Non-interactive setup requires `--yes` to approve local changes.',
      operation: 'setup',
      reasonCode: 'non_interactive_requires_yes',
    });

    expect(getPrimaryLifecycleFailedEvent(context, error)?.properties).toMatchObject({
      error_name: 'services/SetupCommandError',
      failure_reason_code: 'non_interactive_requires_yes',
    });
    const unknown = new SetupCommandError({
      message: 'native failure',
      operation: 'setup',
      reasonCode: 'unknown',
    });
    expect(getPrimaryLifecycleFailedEvent(context, unknown)?.properties?.failure_reason_code).toBe(
      'unknown'
    );
    expect(
      getPrimaryLifecycleFailedEvent(context, new Error('boom'))?.properties
    ).not.toHaveProperty('failure_reason_code');
  });

  it('records a run whose child exited non-zero as failed with reason child_exit', () => {
    const context = commandContext(['run', 'process.exit(3)'], {
      path: ['run'],
      family: 'run',
      input: {},
    });

    const event = getPrimaryLifecycleFailedEvent(context, new ChildProcessExited({ code: 3 }));

    expect(event?.name).toBe(CLI_ANALYTICS_EVENTS.CLI_RUN_FAILED);
    expect(event?.properties).toMatchObject({
      error_name: 'effects/ChildProcessExited',
      failure_reason_code: 'child_exit',
    });
    expect(
      getPrimaryLifecycleFailedEvent(context, new Error('boom'))?.properties
    ).not.toHaveProperty('failure_reason_code');
  });

  it('tracks an unsupported host with a normalized reason code', () => {
    expect(
      getSetupHostDetectedEvent({
        operation: 'setup',
        requestedTarget: 'auto',
        target: 'codex',
        available: true,
        supported: false,
        hostVersion: 'codex-cli 0.137.0',
        unsupportedReasonCode: 'codex_too_old',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })
    ).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_SETUP_HOST_DETECTED,
      properties: {
        agent_host: 'codex',
        available: true,
        supported: false,
        unsupported_reason_code: 'codex_too_old',
      },
    });
  });

  it('tracks a per-host failure without recording its free-form message', () => {
    const error = new Error(`Adding the claude marketplace failed${'x'.repeat(600)}`);

    const event = getPluginLifecycleFailedEvent({
      operation: 'setup',
      target: 'claude',
      phase: 'install',
      error,
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      cliVersion: APP_VERSION,
    });

    expect(event).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_PLUGIN_SETUP_FAILED,
      properties: {
        command_path: 'setup',
        operation: 'setup',
        agent_host: 'claude',
        phase: 'install',
        error_name: 'Error',
      },
    });
    expect(event?.properties).not.toHaveProperty('error_message');
  });

  it('tracks user cancellation and installer skips with normalized reasons', () => {
    expect(
      getSetupCancelledEvent({
        operation: 'setup',
        requestedTarget: 'claude',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })
    ).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_SETUP_CANCELLED,
      properties: {
        command_path: 'setup',
        operation: 'setup',
        requested_target: 'claude',
        reason: 'user_declined',
      },
    });

    expect(
      getSetupSkippedEvent({
        operation: 'uninstall',
        requestedTarget: 'auto',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })
    ).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_SETUP_SKIPPED,
      properties: {
        command_path: 'setup',
        operation: 'uninstall',
        requested_target: 'auto',
        reason: 'no_host_detected',
      },
    });
  });
});

describe('CLI analytics journey taxonomy', () => {
  afterEach(() => {
    configureCliAnalyticsReleaseVersion(APP_VERSION);
    vi.unstubAllEnvs();
  });

  /** The context of a root command whose name is its family, or the generic `version`. */
  const contextFor = (
    argv: ReadonlyArray<string>,
    invocation: CliInvocationContext = CLI_INVOCATION
  ) => {
    const [name = 'version'] = argv;
    return commandContext(argv, {
      path: [name],
      family: name === 'version' ? 'command' : (name as TelemetryFamily),
      input: {},
      invocation,
    });
  };

  const lifecycleCases: ReadonlyArray<[ReadonlyArray<string>, string]> = [
    [['execute', 'GMAIL_SEND_EMAIL'], 'execute'],
    [['search', 'send email'], 'other'],
    [['link', 'github'], 'connect'],
    [['login'], 'login'],
    [['logout'], 'other'],
    [['proxy', '/api/v3/toolkits'], 'other'],
    [['run', 'echo hi'], 'other'],
    [['install'], 'install'],
    [['setup'], 'setup'],
    [['version'], 'other'],
  ];

  it.each(lifecycleCases)('stamps %j lifecycle events with journey_stage %s', (argv, stage) => {
    const context = contextFor(argv);

    expect(getPrimaryLifecycleInvokedEvent(context)?.properties?.journey_stage).toBe(stage);
    expect(getPrimaryLifecycleSucceededEvent(context)?.properties?.journey_stage).toBe(stage);
    expect(
      getPrimaryLifecycleFailedEvent(context, new Error('boom'))?.properties?.journey_stage
    ).toBe(stage);
  });

  it.each(Object.values(CLI_ANALYTICS_EVENTS))(
    'maps analytics event %s to a declared journey stage',
    name => {
      expect(CLI_JOURNEY_STAGES).toContain(CLI_EVENT_JOURNEY_STAGES[name]);
    }
  );

  it('stamps standalone setup and tool-invocation events with their stages', () => {
    expect(
      getPluginLifecycleSucceededEvent({
        operation: 'setup',
        target: 'claude',
        action: 'installed',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })?.properties?.journey_stage
    ).toBe('setup');

    expect(
      getSetupSkippedEvent({
        operation: 'setup',
        requestedTarget: 'auto',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })?.properties?.journey_stage
    ).toBe('setup');

    expect(
      getToolExecuteFailedEvent({
        toolSlug: 'GMAIL_SEND_EMAIL',
        args: {},
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        surface: 'root',
        projectMode: 'consumer',
        stage: 'execution',
        failureOrigin: 'main_endpoint',
      })?.properties?.journey_stage
    ).toBe('execute');
  });

  it('stamps events with the release channel of the running build', () => {
    const properties = getPrimaryLifecycleInvokedEvent(contextFor(['login']))?.properties;

    expect(properties?.cli_channel).toBe(inferSkillReleaseChannel(APP_VERSION));
    expect(CLI_RELEASE_CHANNELS).toContain(properties?.cli_channel);
  });

  it.effect('uses beta release metadata even when the package version is stable', () => {
    const installDir = tempy.temporaryDirectory();
    const execPath = path.join(installDir, 'composio');
    writeFileSync(execPath, 'fake binary');
    writeFileSync(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.3.1-beta.7\n');

    return Effect.gen(function* () {
      const resolvedVersion = yield* resolveInstalledCliVersion(execPath, APP_VERSION);
      configureCliAnalyticsReleaseVersion(resolvedVersion);

      const context = commandContext(['login'], {
        path: ['login'],
        family: 'login',
        input: {},
        cliVersion: resolvedVersion,
      });
      const properties = getPrimaryLifecycleInvokedEvent(context)?.properties;
      const pluginProperties = getPluginLifecycleSucceededEvent({
        operation: 'setup',
        target: 'codex',
        action: 'installed',
        invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
        cliVersion: APP_VERSION,
      })?.properties;
      expect(inferSkillReleaseChannel(APP_VERSION)).toBe('stable');
      expect(properties?.cli_channel).toBe('beta');
      expect(pluginProperties?.cli_channel).toBe('beta');
    }).pipe(Effect.provide(Layer.merge(BunFileSystem.layer, BunPath.layer)));
  });

  it('propagates the configured installer invocation origin', () => {
    const installerInvocation = { invocationOrigin: 'installer', parentRunId: undefined };

    expect(
      getPrimaryLifecycleInvokedEvent(contextFor(['install'], installerInvocation))?.properties
    ).toMatchObject({
      invocation_origin: 'installer',
      journey_stage: 'install',
    });
  });

  it('mints a run id for run and reads the execute slug from the parsed input', () => {
    const run = commandContext(['--telemetry-debug', 'run', 'console.log("hi")'], {
      path: ['run'],
      family: 'run',
      input: {},
    });
    expect(run.runId).toEqual(expect.any(String));
    expect(getPrimaryLifecycleInvokedEvent(run)).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_RUN_INVOKED,
      properties: { run_id: run.runId, command_path: 'run' },
    });

    const execute = commandContext(['--log-level', 'Debug', 'execute', 'GMAIL_SEND_EMAIL'], {
      path: ['execute'],
      family: 'execute',
      input: { slug: 'GMAIL_SEND_EMAIL', data: Option.none() },
    });
    expect(getPrimaryLifecycleInvokedEvent(execute)).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_INVOKED,
      properties: {
        command_path: 'execute',
        tool_slug: 'GMAIL_SEND_EMAIL',
        toolkit_slug: 'gmail',
      },
    });
  });

  it('reads the link toolkit from the parsed input, and nothing for help or a parse failure', () => {
    const link = (input?: unknown) =>
      getPrimaryLifecycleInvokedEvent(
        commandContext(['link', '--alias', 'work', 'gmail'], {
          path: ['link'],
          family: 'link',
          input,
        })
      )?.properties;
    expect(link({ toolkit: Option.some('gmail'), alias: Option.some('work') })).toMatchObject({
      toolkit: 'gmail',
    });
    expect(link({ toolkit: Option.none() })?.toolkit).toBeUndefined();
    expect(link()?.toolkit).toBeUndefined();
  });

  it('records a parse failure with reason parse_error, and a bare group help without one', () => {
    const context = commandContext(['dev', 'triggers', 'list'], {
      path: ['dev', 'triggers', 'list'],
    });
    const parseError = new CliError.ShowHelp({
      commandPath: ['composio', 'dev', 'triggers', 'list'],
      errors: [new CliError.MissingArgument({ argument: 'toolkit' })],
    });
    expect(getPrimaryLifecycleFailedEvent(context, parseError)).toMatchObject({
      name: CLI_ANALYTICS_EVENTS.CLI_COMMAND_FAILED,
      properties: { command_path: 'dev triggers list', failure_reason_code: 'parse_error' },
    });
    const bareGroup = new CliError.ShowHelp({ commandPath: ['composio', 'dev'], errors: [] });
    expect(getPrimaryLifecycleFailedEvent(context, bareGroup)?.properties).not.toHaveProperty(
      'failure_reason_code'
    );
  });

  it('uses the configured parent run id for nested run telemetry', () => {
    const context = contextFor(['run', 'console.log("hi")'], {
      invocationOrigin: 'run',
      parentRunId: 'run_parent',
    });
    expect(context.runId).toBe('run_parent');
    expect(getPrimaryLifecycleInvokedEvent(context)?.properties).toMatchObject({
      invocation_origin: 'run',
      run_id: 'run_parent',
    });
  });

  it('keeps the base installer install-only and marks shell-setup delegation as installer-origin', () => {
    const installScript = readFileSync(
      new URL('../../../../../install.sh', import.meta.url),
      'utf8'
    );
    // Join backslash-continued lines so multi-line invocations match as one logical line.
    const logicalLines = installScript.replace(/\\\n\s*/g, ' ').split('\n');
    const installInvocations = logicalLines.filter(line => line.includes('"$exe" install'));

    // The installer may invoke `composio install` only for the `--shell` capability probe
    // and the shell-setup delegation; any other invocation would emit install analytics
    // events without the installer origin attached.
    const helpProbes = installInvocations.filter(line => line.includes('"$exe" install --help'));
    const shellDelegations = installInvocations.filter(line =>
      line.includes('"$exe" install --shell')
    );
    expect(helpProbes).toHaveLength(1);
    expect(shellDelegations).toHaveLength(1);
    expect(installInvocations).toHaveLength(2);
    expect(shellDelegations[0]).toContain('COMPOSIO_CLI_INVOCATION_ORIGIN=installer');
  });

  it.each(['zsh', 'bash', 'fish'])(
    'keeps the %s installer variant from invoking the CLI itself',
    shell => {
      const variantScript = readFileSync(
        new URL(`../../../../../install/${shell}.sh`, import.meta.url),
        'utf8'
      );
      // Variants never invoke the CLI themselves: they re-exec the base installer with the
      // shell pinned, so the base installer's shell-setup delegation stays the only CLI
      // install call.
      expect(variantScript).not.toContain('"$exe"');
      expect(variantScript).not.toContain(' install --shell');
      expect(variantScript).toContain('COMPOSIO_INSTALL_SHELL="$variant_shell"');
    }
  );
});
