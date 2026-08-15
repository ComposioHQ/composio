import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as tempy from 'tempy';
import { it } from '@effect/vitest';
import { afterEach, describe, expect, vi } from 'vitest';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { createCliCodactFailureBody } from 'src/analytics/dispatch';
import {
  CLI_ANALYTICS_EVENTS,
  CLI_EVENT_JOURNEY_STAGES,
  CLI_JOURNEY_STAGES,
  configureCliAnalyticsReleaseVersion,
  createCliCommandTelemetryContext,
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
import { APP_VERSION } from 'src/constants';
import { inferSkillReleaseChannel } from 'src/effects/install-skill';
import { CLI_RELEASE_CHANNELS } from 'src/experimental-features';
import {
  DEFAULT_CLI_INVOCATION_ORIGIN,
  type CliInvocationContext,
} from 'src/services/runtime-cli-context';
import { ToolInputValidationError } from 'src/services/tool-input-validation';
import { resolveInstalledCliVersion } from 'src/services/run-companion-modules';

const CLI_INVOCATION = {
  invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
  parentRunId: undefined,
} as const;

describe('CLI analytics execute failure events', () => {
  it('records terminal capabilities supplied by the terminal service', () => {
    const context = createCliCommandTelemetryContext(
      ['bun', 'composio'],
      '0.3.0',
      { stdoutIsTTY: true, stderrIsTTY: false },
      CLI_INVOCATION
    );

    const event = getPrimaryLifecycleInvokedEvent(context);

    expect(event?.properties).toMatchObject({
      stdout_is_tty: true,
      stderr_is_tty: false,
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
    const context = createCliCommandTelemetryContext(
      ['bun', 'composio', 'setup', '--target', 'codex', '--uninstall', '--yes'],
      APP_VERSION,
      { stdoutIsTTY: false, stderrIsTTY: false },
      CLI_INVOCATION
    );

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
    const context = createCliCommandTelemetryContext(
      ['bun', 'composio', 'install', '--completions'],
      APP_VERSION,
      { stdoutIsTTY: false, stderrIsTTY: false },
      CLI_INVOCATION
    );

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
    const terminal = { stdoutIsTTY: false, stderrIsTTY: false };
    const search = getPrimaryLifecycleInvokedEvent(
      createCliCommandTelemetryContext(
        ['bun', 'composio', 'search', 'customer@example.com secret'],
        APP_VERSION,
        terminal,
        CLI_INVOCATION
      )
    );
    const proxy = getPrimaryLifecycleInvokedEvent(
      createCliCommandTelemetryContext(
        ['bun', 'composio', 'proxy', 'https://user:password@example.com/private?token=small'],
        APP_VERSION,
        terminal,
        CLI_INVOCATION
      )
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

  const contextFor = (
    argv: ReadonlyArray<string>,
    invocation: CliInvocationContext = CLI_INVOCATION
  ) =>
    createCliCommandTelemetryContext(
      ['bun', 'composio', ...argv],
      APP_VERSION,
      { stdoutIsTTY: false, stderrIsTTY: false },
      invocation
    );

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

  it('maps every analytics event name to a declared journey stage', () => {
    for (const name of Object.values(CLI_ANALYTICS_EVENTS)) {
      expect(CLI_JOURNEY_STAGES).toContain(CLI_EVENT_JOURNEY_STAGES[name]);
    }
  });

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

      const context = createCliCommandTelemetryContext(
        ['bun', 'composio', 'login'],
        resolvedVersion,
        { stdoutIsTTY: false, stderrIsTTY: false },
        CLI_INVOCATION
      );
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

    for (const shell of ['zsh', 'bash', 'fish']) {
      const variantScript = readFileSync(
        new URL(`../../../../../install/${shell}.sh`, import.meta.url),
        'utf8'
      );
      // Variants never invoke the CLI themselves: they re-exec the base installer with the
      // shell pinned, so the delegation asserted above stays the only CLI install call.
      expect(variantScript).not.toContain('"$exe"');
      expect(variantScript).not.toContain(' install --shell');
      expect(variantScript).toContain('COMPOSIO_INSTALL_SHELL="$variant_shell"');
    }
  });
});
