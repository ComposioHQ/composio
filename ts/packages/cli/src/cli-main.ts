/**
 * Composio CLI runner: composes the top-level Effect layers and drives the
 * root command through `effect/unstable/cli`'s `Command.runWith`.
 *
 * ## v4 runner design (read before touching this file)
 *
 * v3's `@effect/cli` `Command.run`/`runWith` returned a `ValidationError` on
 * parse/validation failure and left rendering (help text, "did you mean"
 * tips) entirely to the caller. This module used to inspect
 * `ValidationError.error` (a `HelpDoc`), render it by hand, and separately
 * look up help text for the resolved command via `root-help.ts` /
 * `command-introspection.ts`.
 *
 * v4's `Command.runWith` (see
 * `ts/vendor/effect/packages/effect/src/unstable/cli/Command.ts`,
 * `runWith`/`showHelp`) is different in a load-bearing way: it *renders
 * help and errors itself* — `Console.log`ing the formatted `HelpDoc` and
 * `Console.error`ing formatted `CliError`s for the resolved `commandPath` —
 * and only then re-fails with a `CliError.ShowHelp`. By the time that
 * failure reaches this module's outer catch, the correct output (respecting
 * whatever command tree/visibility was passed to `Command.runWith`) has
 * already been printed once, to the correct stream.
 *
 * Consequently this module's `CliError.ShowHelp` handler does **not**
 * render anything — doing so would double-print. It only derives the
 * process exit code, mirroring the rule encoded on the error itself
 * (`ShowHelp[Runtime.errorExitCode] = errors.length ? 1 : 0`, see
 * `CliError.ts`): 0 for a bare `--help`/`--version` request, 1 when the
 * help was shown alongside parse/validation errors. `collectValueOptionNames`
 * and the "Tip: --flag requires a value" logic that used to run in this
 * branch are dropped for the same reason: v4's `CliError.InvalidValue`
 * already renders that exact tip natively ("Missing value for flag --x.
 * Expected: ...") as part of `Command.runWith`'s own error output.
 *
 * `matchCommandFromArgv` / `getCommandHelpText` are still used lower down,
 * in the catch-all defect handler — that is a genuinely different path
 * (real command-handler failures captured by `effect-errors`, not CLI
 * parse/validation failures), and `Command.runWith` never renders anything
 * for it, so appending the resolved command's help text there is not a
 * double-print.
 *
 * Two behaviors that v3 configured via `CliConfig` (`autoCorrectLimit: 0`,
 * `isCaseSensitive: true`) have no v4 config equivalent and are instead
 * preserved by providing `CliOutput.layer(ComposioCliOutputFormatter)`
 * (suggestion stripping) — see `cli-config.ts` for the full rationale.
 * `CliConfigLive` below narrows the active built-in global flags to just
 * `--help`/`-h` and `--version`/root `-v`, per `ComposioCliConfig`.
 *
 * `runWithConfig` (from `src/commands`) still receives the *full*
 * `process.argv`, including the node/bun executable and script path
 * prefix, exactly as before. That module slices the prefix off internally
 * for its own routing/help logic. The `effect/unstable/cli` `Command.runWith`
 * (unlike v3's `Command.run`) expects args *without* that prefix, so
 * whatever `commands/index.ts` binds as its own `run` helper is
 * responsible for slicing `argv.slice(2)` immediately before invoking
 * `Command.runWith` — this module does not do that slicing itself, so the
 * contract at the `runWithConfig` boundary must not change.
 */
import process from 'node:process';
import { Cause, ConfigProvider, Effect, Exit, Layer, Logger } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, CliError, CliOutput } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import type { Teardown } from 'effect/Runtime';
import { runWithConfig } from 'src/commands';
import { matchCommandFromArgv, getCommandHelpText } from 'src/commands/root-help';
import * as constants from 'src/constants';
import { ComposioCliConfig, ComposioCliOutputFormatter } from 'src/cli-config';
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
import { ComposioCliUserConfigLive, ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioUserContextLive as _ComposioUserContextLive } from 'src/services/user-context';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ToolsExecutorLive as _ToolsExecutorLive } from 'src/services/tools-executor';
import { ProjectContext } from 'src/services/project-context';
import { ProjectEnvironmentDetector } from 'src/services/project-environment-detector';
import { CommandRunner } from 'src/services/command-runner';
import { StdinLive } from 'src/services/stdin';
import { showUpdateNotice, checkForUpdateInBackground } from 'src/services/update-check';
import {
  createCliCommandTelemetryContext,
  getPrimaryLifecycleFailedEvent,
  getPrimaryLifecycleInvokedEvent,
  getPrimaryLifecycleSucceededEvent,
} from 'src/analytics/events';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { mapOnlyComposioOverrideError } from 'src/services/composio-error-overrides';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { SetupCommandError } from 'src/services/setup';

// Layer is contravariant in ROut and covariant in E, so `never`/`unknown` accept any
// produced context and error type while still pinning the requirements (RIn) to `never`.
type RequiredLayer = Layer.Layer<never, unknown, never>;

export const CliConfigLive = CliConfig.layer(ComposioCliConfig) satisfies RequiredLayer;

export const CliOutputFormatterLive = CliOutput.layer(
  ComposioCliOutputFormatter
) satisfies RequiredLayer;

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
  UpgradeBinary.layer,
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

export const ToolsExecutorLive = Layer.provide(
  _ToolsExecutorLive,
  ComposioClientSingletonLive
) satisfies RequiredLayer;

export const ProjectContextLive = Layer.provide(
  ProjectContext.Default,
  Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, NodeProcess.Default)
) satisfies RequiredLayer;

export const SetupSkillInstallerLive = Layer.provide(
  SetupSkillInstaller.layer,
  Layer.mergeAll(BunFileSystem.layer, BunPath.layer, NodeOs.Default)
) satisfies RequiredLayer;

const layers = Layer.mergeAll(
  CliConfigLive.pipe(Layer.provide(ConfigLive)),
  CliOutputFormatterLive,
  NodeOs.Default,
  NodeProcess.Default,
  UpgradeBinaryLive,
  ComposioCliUserConfigLayer,
  ComposioUserContextLive,
  ComposioSessionRepositoryLive,
  ComposioClientSingletonLive,
  ComposioToolkitsRepositoryCachedLive,
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
  Logger.layer([Logger.consolePretty({ stderr: true })])
) satisfies RequiredLayer;

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

// `runWithConfig`'s root command tree (built from every `.cmd.ts` subcommand in
// `src/commands`) is deep and wide enough that TypeScript's inference collapses its
// requirement (`R`) type to `any` rather than the precise union of service tags. That
// `any` is otherwise infectious through the rest of this pipeline (defeating the
// `Effect.provide(layers)` / `RequiredLayer` checks below), so it is pinned here to the
// same service union `layers` actually provides — this changes nothing at runtime, it
// only restores the precise static type that inference failed to produce on its own.
const runWithArgs = Effect.flatMap(runWithConfig, run => run(process.argv)) as Effect.Effect<
  void,
  unknown,
  Layer.Success<typeof layers>
>;

const runWithTelemetry = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const terminal = yield* ui.capabilities;
  const commandTelemetryContext = createCliCommandTelemetryContext(
    process.argv,
    constants.APP_VERSION,
    terminal
  );
  if (commandTelemetryContext.commandPath === 'run' && commandTelemetryContext.runId) {
    // effect/Config is read-only; the run id must be written into the environment so the run
    // command and the child processes it spawns observe the same telemetry run id.
    // eslint-disable-next-line no-restricted-syntax -- env write propagates run id to children
    process.env.COMPOSIO_CLI_PARENT_RUN_ID = commandTelemetryContext.runId;
  }

  return yield* trackCliEventEffect(getPrimaryLifecycleInvokedEvent(commandTelemetryContext)).pipe(
    Effect.andThen(runWithArgs),
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

checkForUpdateInBackground();

showUpdateNotice.pipe(
  Effect.andThen(runWithTelemetry),
  // `Command.runWith` (see module docs above) already printed help and any
  // parse/validation errors to the correct streams before re-failing with
  // `ShowHelp`. Re-rendering here would double-print, so this only derives
  // the process exit code from the same rule the error already encodes
  // (`Runtime.errorExitCode` on `ShowHelp`: 0 for bare help/version, 1 when
  // shown alongside errors).
  Effect.catchIf(
    (error): error is CliError.ShowHelp => CliError.isCliError(error) && error._tag === 'ShowHelp',
    error =>
      Effect.sync(() => {
        process.exitCode = error.errors.length > 0 ? 1 : 0;
      })
  ),
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
  Effect.withSpan('composio-cli', {
    attributes: {
      name: constants.APP_NAME,
      filename: 'src/bin.ts',
    },
  }),
  Effect.sandbox,
  Effect.catch(
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
          // This handles genuine command-execution failures (business errors captured by
          // effect-errors), a different path from the `CliError.ShowHelp` branch above: those
          // are CLI parse/validation failures that `Command.runWith` already rendered itself.
          // Appending the resolved command's help text here is not a double-print of that.
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
  // v4 removed `Effect.withConfigProvider` (a FiberRef-scoped combinator); `ConfigProvider` is
  // now a `Context.Reference`, so the equivalent is providing it as a layer.
  Effect.provide(ConfigProvider.layer(extendConfigProvider(getBaseConfigProvider()))),
  BunRuntime.runMain({ teardown })
);
