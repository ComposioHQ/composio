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
 * look up help text for the resolved command via `root-help.ts`.
 *
 * v4's `Command.runWith` (see
 * `ts/vendor/effect/packages/effect/src/unstable/cli/Command.ts`,
 * `runWith`/`showHelp`) is different in a load-bearing way: it *renders
 * help and errors itself* — `Console.log`ing the formatted `HelpDoc` and
 * `Console.error`ing formatted `CliError`s for the resolved `commandPath` —
 * and only then re-fails with a `CliError.ShowHelp`. By the time that
 * failure reaches this module, the correct output (respecting whatever
 * command tree/visibility was passed to `Command.runWith`, using v4's own
 * `CliOutput.defaultFormatter()` — see `cli-config.ts` for why Composio no
 * longer overrides it) has already been printed once, to the correct
 * stream.
 *
 * `CliError.ShowHelp` (see `ts/vendor/.../unstable/cli/CliError.ts`) carries
 * two `effect/Runtime` markers set on the class itself:
 * `[Runtime.errorExitCode] = errors.length ? 1 : 0` and
 * `[Runtime.errorReported] = false`. Those markers are how `ShowHelp` tells
 * the runtime "I already printed my own output; don't log me again, and here
 * is the exit code to use." Consequently, this module's job for `ShowHelp`
 * is to do *nothing* — not render, not intercept — and simply let it
 * propagate to `BunRuntime.runMain`: `errorReported = false` suppresses
 * `runMain`'s automatic `Effect.logError(cause)` (see `Runtime.makeRunMain`),
 * and the custom `teardown` below reads `errorExitCode` off the squashed
 * error to pick the process exit code (0 for a bare `--help`/`--version`
 * request, 1 when help was shown alongside parse/validation errors). The
 * sandboxed catch-all handler further down special-cases `ShowHelp` for
 * exactly this reason: it re-fails with the original `Cause` via
 * `Effect.failCause` instead of swallowing it like every other error.
 * `collectValueOptionNames` and the "Tip: --flag requires a value" logic
 * that used to run in a dedicated `ShowHelp` branch here are gone for a
 * related reason: v4's `CliError.InvalidValue` already renders that exact
 * tip natively ("Missing value for flag --x. Expected: ...") as part of
 * `Command.runWith`'s own error output.
 *
 * `matchCommandFromArgv` / `getCommandHelpText` are still used lower down,
 * in the catch-all defect handler — that is a genuinely different path
 * (real command-handler failures captured by `effect-errors`, not CLI
 * parse/validation failures), and `Command.runWith` never renders anything
 * for it, so appending the resolved command's help text there is not a
 * double-print.
 *
 * v3's `CliConfig` also configured `autoCorrectLimit: 0` and
 * `isCaseSensitive: true`. Neither has a v4 config equivalent, and neither
 * is reproduced anymore: v4's parser is always exact-match (no case-folding,
 * so `isCaseSensitive` needs no knob), and "Did you mean?" suggestions on
 * `UnrecognizedOption`/`UnknownSubcommand` now render as-is — see
 * `cli-config.ts` for the full rationale. `CliConfigLive` below narrows the
 * active built-in global flags to just `--help`/`-h` and `--version`/root
 * `-v`, per `ComposioCliConfig`; that narrowing is the only `CliConfig`
 * customization left.
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
import { Cause, ConfigProvider, Effect, Exit, Layer, Logger, Predicate, Runtime } from 'effect';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import { CliConfig, CliError } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { runWithConfig } from 'src/commands';
import { matchCommandFromArgv, getCommandHelpText } from 'src/commands/root-help';
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
  onExit(0);
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
          const cliUserConfig = yield* ComposioCliUserConfig;
          const visibility = {
            isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
            isExperimentalFeatureEnabled: (feature: string) =>
              cliUserConfig.isExperimentalFeatureEnabled(feature),
          };
          // This handles genuine command-execution failures (business errors captured by
          // effect-errors), a different path from the `ShowHelp` branch above: those are CLI
          // parse/validation failures that `Command.runWith` already rendered itself. Appending
          // the resolved command's help text here is not a double-print of that.
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
