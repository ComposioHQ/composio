/**
 * Composes the CLI layers and runs Effect's command parser. Command.runWith renders
 * help and parse errors once; preserve ShowHelp so its runtime markers control logging
 * and the exit code. runWithConfig accepts full argv and removes the executable prefix.
 */
import process from 'node:process';
import { Cause, ConfigProvider, Effect, Exit, Layer, Logger, Predicate, Runtime } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, CliError } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { runWithConfig, type RootCommandBootstrap } from 'src/commands';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
import { getBaseConfigProvider, ConfigLive, extendConfigProvider } from 'src/services/config';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { ComposioToolkitsRepositoryCached } from 'src/services/composio-clients-cached';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import { ComposioCliUserConfigLive } from 'src/services/cli-user-config';
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
import { SetupCommandError } from 'src/services/setup-command-error';
import { ShellSetupAbortError } from 'src/commands/install.cmd';
import { MissingRunSourceError } from 'src/commands/run.cmd';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import { readTelemetryDebugOverride, telemetryDebugModeLayer } from 'src/services/runtime-flags';
import { normalizeRunScriptArgs } from 'src/commands/argv-compat';

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
  BunServices.layer,
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  StdinLive,
  TerminalUILive,
  Layer.merge(Logger.layer([Logger.consolePretty()]), Layer.succeed(Logger.LogToStderr, true))
) satisfies RequiredLayer;

export const teardown: Runtime.Teardown = <E, A>(
  exit: Exit.Exit<E, A>,
  onExit: (code: number) => void
) => {
  if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
    const squashed = Cause.squash(exit.cause);
    // `ShowHelp` carries its own `[Runtime.errorExitCode]` (0 for bare
    // help/version, 1 alongside parse/validation errors, see the module docs
    // above); prefer that over the generic fallback whenever it applies.
    const exitCode =
      CliError.isCliError(squashed) && Predicate.isTagged(squashed, 'ShowHelp')
        ? Runtime.getErrorExitCode(squashed)
        : Number(process.exitCode ?? 1);
    onExit(exitCode);
    return;
  }
  // A command that proxies another process (`composio run`) reports its status by assigning
  // `process.exitCode`, so honor that on every path. It matters most on interrupt: the runtime
  // force-exits with whatever code teardown yields once a signal has been received, which would
  // otherwise turn a cancelled run into a success.
  onExit(Number(process.exitCode ?? 0));
};

// `runWithConfig`'s root command tree (built from every `.cmd.ts` subcommand in
// `src/commands`) is deep and wide enough that TypeScript's inference collapses its
// requirement (`R`) type to `any` rather than the precise union of service tags. That
// `any` is otherwise infectious through the rest of this pipeline (defeating the
// `Effect.provide(layers)` / `RequiredLayer` checks below), so it is pinned here to the
// same service union `layers` actually provides — this changes nothing at runtime, it
// only restores the precise static type that inference failed to produce on its own.
const runWithArgs = (argv: ReadonlyArray<string>, bootstrap: RootCommandBootstrap) =>
  Effect.flatMap(runWithConfig, run => run(argv, bootstrap)) as Effect.Effect<
    void,
    unknown,
    Layer.Success<typeof layers>
  >;

const runWithTelemetry = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const terminal = yield* ui.capabilities;

    const version = yield* getVersion;
    configureCliAnalyticsReleaseVersion(version);
    const baseTelemetryContext = createCliCommandTelemetryContext(
      argv,
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
    return yield* trackCliEventEffect(
      getPrimaryLifecycleInvokedEvent(commandTelemetryContext)
    ).pipe(
      Effect.andThen(runWithArgs(argv, bootstrap)),
      Effect.scoped,
      Effect.mapError(error =>
        CliError.isCliError(error) ? error : mapOnlyComposioOverrideError({ error })
      ),
      Effect.tap(() =>
        trackCliEventEffect(getPrimaryLifecycleSucceededEvent(commandTelemetryContext))
      ),
      Effect.tapCause(cause =>
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
  /** The full, unchanged process argv (executable and script included). */
  readonly argv: ReadonlyArray<string>;
};

const cliProgram = (argv: ReadonlyArray<string>) =>
  showUpdateNotice.pipe(
    Effect.andThen(showPluginAcquisitionHint(argv)),
    Effect.andThen(runWithTelemetry(argv)),
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
    Effect.catch(
      Effect.fn(function* (cause) {
        const squashed = Cause.squash(cause);
        if (CliError.isCliError(squashed) && Predicate.isTagged(squashed, 'ShowHelp')) {
          // `Command.runWith` already printed help and any parse/validation
          // errors to the correct stream (see the module docs above) before
          // re-failing with `ShowHelp`. Re-failing with the original `cause`
          // here — instead of swallowing it like every other error below —
          // lets it reach `BunRuntime.runMain` untouched: `ShowHelp`'s
          // `[Runtime.errorReported] = false` suppresses `runMain`'s automatic
          // error log, and `teardown` reads its `[Runtime.errorExitCode]` to
          // pick the process exit code. Nothing here may print, or output
          // doubles.
          return yield* Effect.failCause(cause);
        }

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
            process.exitCode = 1;
          }
        }
      })
    ),
    Effect.provide(layers),
    // v4 removed `Effect.withConfigProvider` (a FiberRef-scoped combinator); `ConfigProvider` is
    // now a `Context.Reference`, so the equivalent is providing it as a layer.
    Effect.provide(ConfigProvider.layer(extendConfigProvider(getBaseConfigProvider())))
  );

export const runCli = (options: CliBootstrapOptions): void => {
  const debug = readTelemetryDebugOverride(normalizeRunScriptArgs(options.argv));
  cliProgram(options.argv).pipe(
    effect =>
      debug === undefined ? effect : Effect.provide(effect, telemetryDebugModeLayer(debug)),
    BunRuntime.runMain({ teardown })
  );
};
