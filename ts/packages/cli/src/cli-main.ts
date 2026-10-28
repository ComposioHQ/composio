/**
 * Composes the CLI layers and runs Effect's command parser. Command.runWith renders
 * help and parse errors once. runWithConfig accepts full argv and removes the executable prefix.
 *
 * Exit codes come from Effect's runtime markers, never `process.exitCode`: a failure that is
 * already on screen (ShowHelp, a command's own report, or a message printed here) carries
 * `[Runtime.errorReported] = false`, so the runner logs nothing, and `Runtime.defaultTeardown`
 * exits with its `[Runtime.errorExitCode]` (1 when unset), or 0 on success. Signals are the
 * runner's (`src/run-main.ts`): a command a signal cancelled exits 128 + its number.
 */
import { Cause, ConfigProvider, Effect, Layer, Logger, Runtime } from 'effect';
import * as Path from 'effect/Path';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, CliError } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { runWithConfig, type RootCommandBootstrap } from 'src/commands';
import { withoutClientNotices } from 'src/effects/without-client-notices';
import * as constants from 'src/constants';
import { ComposioCliConfig } from 'src/cli-config';
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
import { isRejectedUserApiKey, rejectedUserApiKeyHint } from 'src/effects/rejected-user-api-key';
import { extractMessage } from 'src/utils/api-error-extraction';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ToolsExecutorLive as _ToolsExecutorLive } from 'src/services/tools-executor';
import { DashboardToolExecution } from 'src/services/dashboard-tool-execution';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { ProjectContext } from 'src/services/project-context';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { CommandRunner } from 'src/services/command-runner';
import { StdinLive } from 'src/services/stdin';
import { PluginHint } from 'src/services/plugin-hint';
import { UpdateNotice } from 'src/services/update-check';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import type { HookInvocation } from 'src/services/invocation-hook';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import {
  configureCliAnalyticsReleaseVersion,
  createCliCommandTelemetryContext,
  getExecuteCommandToolSlug,
} from 'src/analytics/events';
import { getVersion } from 'src/effects/version';
import { LogLevelFromConfigLive } from 'src/effects/with-log-level';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { mapOnlyComposioOverrideError } from 'src/services/composio-error-overrides';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { PendingLoginSession } from 'src/services/pending-login-session';
import { isExpectedFailure, type ExpectedFailure } from 'src/effects/expected-failure';
import { ReportedFailure } from 'src/effects/report-failure';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import { readTelemetryDebugOverride, telemetryDebugModeLayer } from 'src/services/runtime-flags';
import { normalizeRunScriptArgs } from 'src/commands/argv-compat';
import { makeShutdownController, ShutdownSignal } from 'src/services/shutdown-signal';
import { makeCliRunMain } from 'src/run-main';

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
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, LogLevelFromConfigLive)
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
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, LogLevelFromConfigLive)
) satisfies RequiredLayer;

// Fed the cached repository so that the staleness refresh behind it shares the
// one catalog fetch a run is allowed, rather than starting a second.
export const ToolkitSlugCatalogLive = Layer.provide(
  ToolkitSlugCatalog.Default,
  ComposioToolkitsRepositoryCachedLive
) satisfies RequiredLayer;

export const DashboardToolExecutionLive = Layer.provide(
  DashboardToolExecution.Default,
  Layer.mergeAll(ComposioUserContextLive, FetchHttpClient.layer)
);

export const ToolsExecutorLive = Layer.provide(
  _ToolsExecutorLive,
  Layer.mergeAll(ComposioClientSingletonLive, ToolkitSlugCatalogLive, DashboardToolExecutionLive)
) satisfies RequiredLayer;

export const ProjectContextLive = Layer.provide(
  ProjectContext.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, NodeProcess.Default)
) satisfies RequiredLayer;

export const SetupSkillInstallerLive = Layer.provide(
  SetupSkillInstaller.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const PendingLoginSessionLive = Layer.provide(
  PendingLoginSession.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const BackendMismatchWarningLive = Layer.provide(
  BackendMismatchWarning.Default,
  Layer.mergeAll(ComposioUserContextLive, TerminalUILive)
) satisfies RequiredLayer;

// `Path.layer`, not `BunPath.layer`: the update notice and the plugin hint have always resolved
// their state files with Effect's own path implementation.
export const UpdateNoticeLive = Layer.provide(
  UpdateNotice.Default,
  Layer.mergeAll(TerminalUILive, BunFileSystem.layer, Path.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const PluginHintLive = Layer.provide(
  PluginHint.Default,
  Layer.mergeAll(TerminalUILive, BunFileSystem.layer, Path.layer, NodeOs.Default)
) satisfies RequiredLayer;

export const CommandLifecycleTelemetryLive = Layer.provide(
  CommandLifecycleTelemetry.Default,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default, TerminalUILive)
) satisfies RequiredLayer;

const layers = Layer.mergeAll(
  CliConfigLive.pipe(Layer.provide(LogLevelFromConfigLive)),
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
  PendingLoginSessionLive,
  BunServices.layer,
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  StdinLive,
  TerminalUILive,
  BackendMismatchWarningLive,
  UpdateNoticeLive,
  PluginHintLive,
  CommandLifecycleTelemetryLive,
  Layer.merge(
    Logger.layer([withoutClientNotices(Logger.consolePretty())]),
    Layer.succeed(Logger.LogToStderr, true)
  )
) satisfies RequiredLayer;

/**
 * Whether `reason` has nothing for the catch-all to print: a failure already on screen, or an
 * interruption, which must reach the runner untouched: 128 + n after a signal, else 130 from
 * `Runtime.defaultTeardown`.
 */
const hasNothingToPrint = (reason: Cause.Reason<unknown>): boolean =>
  Cause.isInterruptReason(reason) ||
  (Cause.isFailReason(reason) && !Runtime.getErrorReported(reason.error));

/**
 * Prints the parts of `cause` nobody reported yet and fails with `ReportedFailure`. A cause with
 * nothing to print (a failure already on screen — `ShowHelp`, which `Command.runWith` printed
 * with any parse/validation errors, a command's own report, or a message printed in
 * `cliProgram` — or an interruption) is re-failed untouched: its `[Runtime.errorReported]` is
 * false, so the runner logs nothing, and `Runtime.defaultTeardown` exits with its
 * `[Runtime.errorExitCode]`; interruptions alone exit 128 + n after a signal, else 130. Nothing
 * here may print it, or output doubles.
 */
export const reportUnreportedCause = Effect.fn(function* (cause: Cause.Cause<unknown>) {
  const unreported = Cause.fromReasons(cause.reasons.filter(reason => !hasNothingToPrint(reason)));
  if (unreported.reasons.length > 0) {
    const captured = yield* captureErrors(unreported, { stripCwd: true });
    const message =
      captured.errors.length > 0
        ? prettyPrintFromCapturedErrors(captured, {
            hideStackTrace: true,
            stripCwd: true,
            enabled: true,
          }).trim()
        : '';
    if (message.length > 0) {
      const ui = yield* TerminalUI;
      yield* ui.error(message);
      return yield* new ReportedFailure({ message });
    }
  }
  // Nothing printable: keep the original cause so its exit code survives and the runner logs
  // whatever is still unreported, instead of exiting 0.
  return yield* Effect.failCause(cause);
});

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
    Layer.Success<typeof layers> | ShutdownSignal
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
    const telemetry = yield* CommandLifecycleTelemetry;
    return yield* telemetry.invoked(commandTelemetryContext).pipe(
      Effect.andThen(runWithArgs(argv, bootstrap)),
      Effect.scoped,
      Effect.mapError(error =>
        CliError.isCliError(error) ? error : mapOnlyComposioOverrideError({ error })
      ),
      Effect.tap(() => telemetry.succeeded(commandTelemetryContext)),
      Effect.tapCause(cause => telemetry.failed(commandTelemetryContext, cause))
    );
  });

/**
 * Values `src/bin.ts` resolved before the Effect runtime existed and hands to it here.
 */
export type CliBootstrapOptions = {
  /** The full, unchanged process argv (executable and script included). */
  readonly argv: ReadonlyArray<string>;
};

/** Runs the hooks every invocation gets before its command, in order, on stderr. */
const runInvocationHooks = (invocation: HookInvocation) =>
  Effect.gen(function* () {
    const backendMismatchWarning = yield* BackendMismatchWarning;
    const updateNotice = yield* UpdateNotice;
    const pluginHint = yield* PluginHint;
    yield* backendMismatchWarning.run(invocation);
    yield* updateNotice.run(invocation);
    yield* pluginHint.run(invocation);
  });

const cliProgram = (argv: ReadonlyArray<string>) =>
  runInvocationHooks({ argv }).pipe(
    Effect.andThen(runWithTelemetry(argv)),
    // A usage mistake, a missing setup or login, or a failure a remote service reported clearly
    // (see `ExpectedFailure`) is not a broken invariant: print the message and exit 1 instead of
    // routing it through the defect reporter below.
    Effect.catchIf(
      (error): error is ExpectedFailure => isExpectedFailure(error),
      error =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;
          yield* ui.error(error.message);
          return yield* new ReportedFailure({ message: error.message });
        })
    ),
    // A rejected user API key gets the backend's message and the way to log in again, from
    // whichever command it escaped.
    Effect.catchIf(isRejectedUserApiKey, error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const message = extractMessage(error) ?? 'The user API key was rejected.';
        yield* ui.error(message);
        yield* ui.error(yield* rejectedUserApiKeyHint);
        return yield* new ReportedFailure({ message });
      })
    ),
    Effect.withSpan('composio-cli', {
      attributes: {
        name: constants.APP_NAME,
        filename: 'src/bin.ts',
      },
    }),
    Effect.sandbox,
    Effect.catch(reportUnreportedCause),
    Effect.provide(layers),
    // Built per invocation, never at module scope: `ConfigProvider.fromEnv()` snapshots
    // `process.env` when constructed, and the ambient `ConfigProvider` reference caches its
    // default snapshot process-wide on first use. A fresh provider here means every config read
    // of this invocation observes the environment as it is now (`vi.stubEnv` in tests, any
    // in-process mutation before `runCli`).
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

export const runCli = (options: CliBootstrapOptions): void => {
  const debug = readTelemetryDebugOverride(normalizeRunScriptArgs(options.argv));
  // One per invocation: the runner reports the process's signals to the command through it.
  const shutdown = makeShutdownController();
  cliProgram(options.argv).pipe(
    Effect.provideService(ShutdownSignal, shutdown.service),
    effect =>
      debug === undefined ? effect : Effect.provide(effect, telemetryDebugModeLayer(debug)),
    makeCliRunMain(shutdown)()
  );
};
