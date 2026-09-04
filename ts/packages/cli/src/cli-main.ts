import process from 'node:process';
import { Cause, Effect, Exit, Layer, Logger } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, HelpDoc, ValidationError } from '@effect/cli';
import { FetchHttpClient } from '@effect/platform';
import { BunContext, BunRuntime, BunFileSystem, BunPath } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';
import { buildRootCommand, runWithConfig, type RootCommandBootstrap } from 'src/commands';
import { collectValueOptionNames } from 'src/commands/command-introspection';
import { matchCommandFromArgv, getCommandHelpText } from 'src/commands/root-help';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
import { BaseConfigProviderLive, ConfigLive, extendConfigProvider } from 'src/services/config';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { ComposioToolkitsRepositoryCached } from 'src/services/composio-clients-cached';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import { ComposioCliUserConfigLive, ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioUserContextLive as _ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ToolsExecutorLive as _ToolsExecutorLive } from 'src/services/tools-executor';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { ProjectContext } from 'src/services/project-context';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { CommandRunner } from 'src/services/command-runner';
import { StdinLive } from 'src/services/stdin';
import { showPluginAcquisitionHint } from 'src/services/plugin-hint';
import { showUpdateNotice } from 'src/services/update-check';
import {
  configureCliAnalyticsReleaseVersion,
  createCliCommandTelemetryContext,
  getExecuteCommandToolSlug,
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
} from 'src/analytics/events';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { getVersion } from 'src/effects/version';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { mapOnlyComposioOverrideError } from 'src/services/composio-error-overrides';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { SetupCommandError } from 'src/services/setup';
import { ShellSetupAbortError } from 'src/commands/install.cmd';
import { MissingRunSourceError } from 'src/commands/run.cmd';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import { telemetryDebugModeLayer } from 'src/services/runtime-flags';

// Layer is contravariant in ROut and covariant in E, so `never`/`unknown` accept any
// produced context and error type while still pinning the requirements (RIn) to `never`.
type RequiredLayer = Layer.Layer<never, unknown, never>;

export const CliConfigLive = CliConfig.layer(ComposioCliConfig) satisfies RequiredLayer;

export const ComposioUserContextLive = Layer.provide(
  _ComposioUserContextLive,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioCliUserConfigLayer = Layer.provide(
  ComposioCliUserConfigLive,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
);

export const ComposioSessionRepositoryLive = Layer.provide(
  ComposioSessionRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioToolkitsRepositoryLive = Layer.provide(
  ComposioToolkitsRepository.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, ConfigLive)
) satisfies RequiredLayer;

export const ComposioToolkitsRepositoryCachedLive = Layer.provide(
  ComposioToolkitsRepositoryCached,
  ComposioToolkitsRepositoryLive
) satisfies RequiredLayer;

export const UpgradeBinaryLive = Layer.provide(
  UpgradeBinary.Default,
  Layer.mergeAll(BunFileSystem.layer, FetchHttpClient.layer)
) satisfies RequiredLayer;

export const TriggersRealtimeLive = Layer.provide(
  TriggersRealtime.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const ComposioClientSingletonLive = Layer.provide(
  ComposioClientSingleton.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, ConfigLive)
) satisfies RequiredLayer;

// Fed the cached repository so that the staleness refresh behind it shares the
// one catalog fetch a run is allowed, rather than starting a second.
export const ToolkitSlugCatalogLive = Layer.provide(
  ToolkitSlugCatalog.Default,
  ComposioToolkitsRepositoryCachedLive
) satisfies RequiredLayer;

export const ToolsExecutorLive = Layer.provide(
  _ToolsExecutorLive,
  Layer.mergeAll(ComposioClientSingletonLive, ToolkitSlugCatalogLive)
) satisfies RequiredLayer;

export const ProjectContextLive = Layer.provide(
  ProjectContext.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, NodeProcess.Default)
) satisfies RequiredLayer;

export const SetupSkillInstallerLive = Layer.provide(
  SetupSkillInstaller.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

const layers = Layer.mergeAll(
  CliConfigLive.pipe(Layer.provide(ConfigLive)),
  NodeOs.Default,
  NodeProcess.Default,
  UpgradeBinaryLive,
  ComposioCliUserConfigLayer,
  ComposioUserContextLive,
  ComposioSessionRepositoryLive,
  ComposioClientSingletonLive,
  ComposioToolkitsRepositoryCachedLive,
  ToolkitSlugCatalogLive,
  ToolsExecutorLive,
  JsPackageManagerDetector.Default,
  ProjectEnvironmentDetector.Default,
  CommandRunner.Default,
  SetupSkillInstallerLive,
  TriggersRealtimeLive,
  ProjectContextLive,
  BunContext.layer,
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  StdinLive,
  TerminalUILive,
  Logger.replace(Logger.defaultLogger, Logger.prettyLogger({ stderr: true }))
) satisfies RequiredLayer;

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  // A command that proxies another process (`composio run`) reports its status by assigning
  // `process.exitCode`, so honor that on every path. It matters most on interrupt: the runtime
  // force-exits with whatever code teardown yields once a signal has been received, which would
  // otherwise turn a cancelled run into a success.
  onExit(Number(process.exitCode ?? (shouldFail ? 1 : 0)));
};

const runWithArgs = (bootstrap: RootCommandBootstrap) =>
  Effect.flatMap(runWithConfig, run => run(process.argv, bootstrap)) satisfies Effect.Effect<
    void,
    unknown,
    unknown
  >;

const runWithTelemetry = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const terminal = yield* ui.capabilities;

  const version = yield* getVersion;
  configureCliAnalyticsReleaseVersion(version);
  const baseTelemetryContext = createCliCommandTelemetryContext(
    process.argv,
    version,
    terminal,
    yield* cliInvocationContext
  );
  const executeToolSlug = getExecuteCommandToolSlug(baseTelemetryContext);
  const commandTelemetryContext =
    executeToolSlug === undefined
      ? baseTelemetryContext
      : { ...baseTelemetryContext, toolkitSlug: yield* toolkitFromToolSlug(executeToolSlug) };
  // `composio run` mints its run id here so the lifecycle events and the id the spawned script
  // inherits are the same value; every other command leaves it unset.
  const bootstrap: RootCommandBootstrap =
    commandTelemetryContext.commandPath === 'run' && commandTelemetryContext.runId
      ? { runId: commandTelemetryContext.runId }
      : {};
  return yield* trackCliEventEffect(getPrimaryLifecycleInvokedEvent(commandTelemetryContext)).pipe(
    Effect.andThen(runWithArgs(bootstrap)),
    Effect.scoped,
    Effect.mapError(error =>
      ValidationError.isValidationError(error) ? error : mapOnlyComposioOverrideError({ error })
    ),
    Effect.tap(() =>
      trackCliEventEffect(getPrimaryLifecycleSucceededEvent(commandTelemetryContext))
    ),
    Effect.tapErrorCause(cause =>
      trackCliEventEffect(
        getPrimaryLifecycleFailedEvent(commandTelemetryContext, Cause.squash(cause))
      )
    )
  );
});

/**
 * Values `src/bin.ts` resolved before the Effect runtime existed and hands to it here.
 */
export type CliBootstrapOptions = {
  /** `--telemetry-debug` was on the command line, and was stripped from argv before parsing. */
  readonly telemetryDebug: boolean;
};

const cliProgram = showUpdateNotice.pipe(
  Effect.andThen(showPluginAcquisitionHint(process.argv)),
  Effect.andThen(runWithTelemetry),
  Effect.catchIf(ValidationError.isValidationError, error => {
    return Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const cliUserConfig = yield* ComposioCliUserConfig;
      const visibility = {
        isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
        isExperimentalFeatureEnabled: (feature: string) =>
          cliUserConfig.isExperimentalFeatureEnabled(feature),
      };
      const valueOptionNames = collectValueOptionNames(buildRootCommand(visibility));
      const text = HelpDoc.toAnsiText(error.error).trim();
      const errorEffect = text.length > 0 ? ui.error(text) : Effect.void;
      const flagMatch = text.match(/Received unknown argument: '(-{1,2}[\w-]+)'/);
      const tipEffect =
        flagMatch && valueOptionNames.has(flagMatch[1])
          ? ui.error(`Tip: ${flagMatch[1]} requires a value, e.g. ${flagMatch[1]} "value"`)
          : Effect.void;
      const cmdName = matchCommandFromArgv(process.argv, visibility);
      const helpText = cmdName ? getCommandHelpText(cmdName, visibility) : undefined;
      const helpEffect = helpText ? ui.error(helpText) : Effect.void;
      return yield* Effect.all([errorEffect, tipEffect, helpEffect], { discard: true }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            process.exitCode = 1;
          })
        )
      );
    });
  }),
  Effect.catchIf(
    (error): error is SetupCommandError => error instanceof SetupCommandError,
    error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const summary =
          error.operation === 'uninstall'
            ? 'Composio plugin uninstall was unsuccessful.'
            : 'Composio setup was unsuccessful.';
        if ((yield* ui.capabilities).canDecorate) {
          yield* ui.log.error(error.message);
          yield* ui.outro(summary);
        } else {
          yield* ui.error(`${summary} ${error.message}`);
        }
        process.exitCode = 1;
      })
  ),
  // A bare `composio run` is a usage mistake, not a broken invariant: print the one-line fix and
  // exit non-zero instead of routing it through the defect reporter below.
  Effect.catchIf(
    (error): error is MissingRunSourceError => error instanceof MissingRunSourceError,
    error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.error(error.message);
        process.exitCode = 1;
      })
  ),
  Effect.catchIf(
    (error): error is ShellSetupAbortError => error instanceof ShellSetupAbortError,
    // `composio install` already printed the abort reason; the typed failure
    // only exists so the process exits non-zero and install.sh runs its
    // guarded inline PATH fallback instead of reporting a green install.
    () =>
      Effect.sync(() => {
        process.exitCode = 1;
      })
  ),
  Effect.withSpan('composio-cli', {
    attributes: {
      name: constants.APP_NAME,
      filename: 'src/bin.ts',
    },
  }),
  Effect.sandbox,
  Effect.catchAll(
    Effect.fn(function* (cause) {
      const captured = yield* captureErrors(cause, {
        stripCwd: true,
      });
      const filteredErrors = captured.errors.filter(
        error => error.errorType !== 'ReportedToolExecutionError'
      );
      if (captured.interrupted || filteredErrors.length > 0) {
        const message = prettyPrintFromCapturedErrors(
          { ...captured, errors: filteredErrors },
          {
            hideStackTrace: true,
            stripCwd: true,
            enabled: true,
          }
        ).trim();
        if (message.length > 0) {
          const ui = yield* TerminalUI;
          yield* ui.error(message);
          const cliUserConfig = yield* ComposioCliUserConfig;
          const visibility = {
            isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
            isExperimentalFeatureEnabled: (feature: string) =>
              cliUserConfig.isExperimentalFeatureEnabled(feature),
          };
          const cmdName = matchCommandFromArgv(process.argv, visibility);
          const helpText = cmdName ? getCommandHelpText(cmdName, visibility) : undefined;
          if (helpText) {
            yield* ui.error(helpText);
          }
          process.exitCode = 1;
        }
      }
    })
  ),
  Effect.provide(layers),
  Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive))
);

export const runCli = (options: CliBootstrapOptions): void => {
  cliProgram.pipe(
    // Only provided when the flag was actually present: without it telemetry debugging falls back
    // to `COMPOSIO_CLI_TELEMETRY_DEBUG`.
    effect =>
      options.telemetryDebug ? Effect.provide(effect, telemetryDebugModeLayer(true)) : effect,
    BunRuntime.runMain({ teardown })
  );
};
