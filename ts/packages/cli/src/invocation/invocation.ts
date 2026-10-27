/**
 * One CLI invocation, from argv to a finished command: the hooks every invocation runs, the
 * command's lifecycle telemetry, `effect/cli`'s parser and the selected command, and the one place
 * a failure is put on screen. `runCli` (`src/cli-main.ts`) runs it for the binary over
 * `InvocationLive`; tests run it through `cli()` over `TestLive`.
 *
 * Every failure leaves `runInvocation` on screen exactly once: printed by `Command.runWith` (help
 * and parse errors, `CliError.ShowHelp`), by the command itself (`[Runtime.errorReported] = false`),
 * or here (an expected failure's message, a rejected key, or the defect report). It leaves with
 * its own cause, so a caller can still match its typed error; `forRunner` turns it into what the
 * runner needs to print nothing more and exit with the right code.
 */
import { Cause, Effect, Exit, Option, Runtime, type Layer } from 'effect';
import { CliError } from 'effect/cli';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import {
  configureCliAnalyticsReleaseVersion,
  createCliCommandTelemetryContext,
  getExecuteCommandToolSlug,
} from 'src/analytics/events';
import { runWithConfig, type RootCommandBootstrap } from 'src/commands';
import * as constants from 'src/constants';
import { isExpectedFailure } from 'src/effects/expected-failure';
import { isRejectedUserApiKey, rejectedUserApiKeyHint } from 'src/effects/rejected-user-api-key';
import { ReportedFailure } from 'src/effects/report-failure';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { getVersion } from 'src/effects/version';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import { mapOnlyComposioOverrideError } from 'src/services/composio-error-overrides';
import type { HookInvocation } from 'src/services/invocation-hook';
import { PluginHint } from 'src/services/plugin-hint';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import type { ShutdownSignal } from 'src/services/shutdown-signal';
import { TerminalUI } from 'src/services/terminal-ui';
import { UpdateNotice } from 'src/services/update-check';
import { extractMessage } from 'src/utils/api-error-extraction';
import type { InvocationLive } from './live';

/** The services an invocation runs with: `InvocationLive` in the binary, `TestLive` in tests. */
export type InvocationServices = Layer.Success<typeof InvocationLive> | ShutdownSignal;

// `runWithConfig`'s root command tree (built from every `.cmd.ts` subcommand in
// `src/commands`) is deep and wide enough that TypeScript's inference collapses its
// requirement (`R`) type to `any` rather than the precise union of service tags. That
// `any` is otherwise infectious through the rest of this pipeline, so it is pinned here to the
// services an invocation is given — this changes nothing at runtime, it only restores the
// precise static type that inference failed to produce on its own.
const runWithArgs = (argv: ReadonlyArray<string>, bootstrap: RootCommandBootstrap) =>
  Effect.flatMap(runWithConfig, run => run(argv, bootstrap)) as Effect.Effect<
    void,
    unknown,
    InvocationServices
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

/** Whether `reason` is a failure already on screen, which nothing here may print again. */
const isAlreadyReported = (reason: Cause.Reason<unknown>): boolean =>
  Cause.isFailReason(reason) && !Runtime.getErrorReported(reason.error);

/**
 * Puts the failure `cause` on screen unless it already is. Succeeds with whether the failure is
 * on screen now; `false` only when there was nothing to show.
 */
const report = (cause: Cause.Cause<unknown>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const error = Cause.findErrorOption(cause);
    // A usage mistake, a missing setup or login, or a failure a remote service reported clearly
    // (see `ExpectedFailure`) is not a broken invariant: its message alone, no defect report.
    const expected = Option.filter(error, isExpectedFailure);
    if (Option.isSome(expected)) {
      yield* ui.error(expected.value.message);
      return true;
    }
    // A rejected user API key gets the backend's message and the way to log in again, from
    // whichever command it escaped.
    const rejectedKey = Option.filter(error, isRejectedUserApiKey);
    if (Option.isSome(rejectedKey)) {
      yield* ui.error(extractMessage(rejectedKey.value) ?? 'The user API key was rejected.');
      yield* ui.error(yield* rejectedUserApiKeyHint);
      return true;
    }
    // A failure already on screen — `ShowHelp` (`Command.runWith` printed help and any
    // parse/validation errors before failing with it), or a command's own report — must not be
    // printed again, or output doubles.
    const unreported = Cause.fromReasons(
      cause.reasons.filter(reason => !isAlreadyReported(reason))
    );
    if (unreported.reasons.length === 0) {
      return true;
    }
    const captured = yield* captureErrors(unreported, { stripCwd: true });
    if (!captured.interrupted && captured.errors.length === 0) {
      return false;
    }
    const message = prettyPrintFromCapturedErrors(captured, {
      hideStackTrace: true,
      stripCwd: true,
      enabled: true,
    }).trim();
    if (message.length === 0) {
      return false;
    }
    yield* ui.error(message);
    return true;
  });

/**
 * Runs one invocation of the CLI for the full process `argv` (executable and script included):
 * the invocation hooks (before parsing), then the command under lifecycle telemetry.
 *
 * Fails with the command's own cause once it is on screen. An interruption the defect report
 * printed fails with `ReportedFailure`, since it has no error of its own to keep.
 */
export const runInvocation = (
  argv: ReadonlyArray<string>
): Effect.Effect<void, unknown, InvocationServices> =>
  runInvocationHooks({ argv }).pipe(
    Effect.andThen(runWithTelemetry(argv)),
    Effect.withSpan('composio-cli', {
      attributes: {
        name: constants.APP_NAME,
        filename: 'src/bin.ts',
      },
    }),
    Effect.catchCause(cause =>
      report(cause).pipe(
        Effect.flatMap(onScreen => {
          if (!onScreen) {
            return Effect.void;
          }
          return Cause.hasInterruptsOnly(cause)
            ? Effect.fail(new ReportedFailure({ message: 'The command was interrupted.' }))
            : Effect.failCause(cause);
        })
      )
    )
  );

/**
 * The cause the runner receives for a failed invocation. A failure `runInvocation` put on screen
 * becomes a `ReportedFailure`: the runner logs nothing and exits 1. A failure that was on screen
 * before (`ShowHelp`, a command's own report, `ChildProcessExited`) keeps its markers and its
 * exit code, and an interruption stays one, so a signal still decides the exit.
 */
export const runnerCause = (cause: Cause.Cause<unknown>): Cause.Cause<unknown> =>
  Cause.hasInterruptsOnly(cause) || cause.reasons.every(isAlreadyReported)
    ? cause
    : Cause.fail(new ReportedFailure({ message: Cause.pretty(cause) }));

/** `exit` as the runner receives it; see {@link runnerCause}. */
export const runnerExit = <A>(exit: Exit.Exit<A, unknown>): Exit.Exit<A, unknown> =>
  Exit.isSuccess(exit) ? exit : Exit.failCause(runnerCause(exit.cause));

/** Hands `runInvocation`'s result to the runner; see {@link runnerCause}. */
export const forRunner = <A, R>(self: Effect.Effect<A, unknown, R>): Effect.Effect<A, unknown, R> =>
  Effect.catchCause(self, cause => Effect.failCause(runnerCause(cause)));
