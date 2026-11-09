/**
 * One CLI invocation, from argv to a finished command: the command's lifecycle telemetry,
 * `effect/cli`'s parser and the selected command, the hooks the selected command runs, and the one
 * place a failure is put on screen. `runCli` (`src/cli-main.ts`) runs it for the binary over
 * `InvocationLive`; tests run it through `cli()` over `TestLive`.
 *
 * Every failure leaves `runInvocation` on screen exactly once: printed by `Command.runWith` (help
 * and parse errors, `CliError.ShowHelp`), by the command itself (`[Runtime.errorReported] = false`),
 * or here (an expected failure's message, a rejected key, or the defect report). It leaves with
 * its own cause, so a caller can still match its typed error; `forRunner` turns it into what the
 * runner needs to print nothing more and exit with the right code.
 */
import { Cause, Effect, Exit, Option, Ref, Runtime, type Layer } from 'effect';
import { CliError } from 'effect/cli';
import { captureErrors, prettyPrintFromCapturedErrors } from 'effect-errors/index';
import {
  configureCliAnalyticsReleaseVersion,
  createCliCommandTelemetryContext,
} from 'src/analytics/events';
import type { CliCommandTelemetryContext } from 'src/analytics/types';
import { runWithConfig } from 'src/commands';
import * as constants from 'src/constants';
import { isExpectedFailure } from 'src/effects/expected-failure';
import { isRejectedUserApiKey, rejectedUserApiKeyHint } from 'src/effects/rejected-user-api-key';
import { ReportedFailure } from 'src/effects/report-failure';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { getVersion } from 'src/effects/version';
import {
  type CommandIdentity,
  CommandInvocation,
  type CommandInvocationShape,
  INVOCATION_HOOKS,
  type InvocationHookName,
  ROOT_IDENTITY,
  runsHook,
} from 'src/invocation/command-identity';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { CommandLifecycleTelemetry } from 'src/services/command-lifecycle-telemetry';
import type { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { mapOnlyComposioOverrideError } from 'src/services/composio-error-overrides';
import type { InvocationHookShape } from 'src/services/invocation-hook';
import { PluginHint } from 'src/services/plugin-hint';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import type { ShutdownSignal } from 'src/services/shutdown-signal';
import { TerminalUI } from 'src/services/terminal-ui';
import type { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { BackgroundUpdateCheck, UpdateNotice } from 'src/services/update-check';
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
const runWithArgs = (argv: ReadonlyArray<string>) =>
  Effect.flatMap(runWithConfig, run => run(argv)) as Effect.Effect<
    void,
    unknown,
    InvocationServices
  >;

/**
 * Runs the command `effect/cli` selects for `argv` under its lifecycle telemetry. The command's
 * identity is known only once the parser selected it: the selected registration calls
 * `CommandInvocation.begin` (`src/commands/registration.ts`), and so do `--help`, `--version`,
 * and a parse failure, for the command path `effect/cli` gives them. `begin` runs the selected
 * command's invocation hooks, then reports the invoked event; the outcome is reported for the
 * same command. A failure before any `begin` (a group-level check) is reported against the
 * deepest registration whose dispatch started.
 */
const runWithTelemetry = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const terminal = yield* ui.capabilities;
    const version = yield* getVersion;
    configureCliAnalyticsReleaseVersion(version);
    const invocationContext = yield* cliInvocationContext;
    const telemetry = yield* CommandLifecycleTelemetry;
    const toolkitLookup = yield* Effect.context<ComposioToolkitsRepository | ToolkitSlugCatalog>();
    const startedAt = Date.now();

    const contextFor = (identity: CommandIdentity, input: Option.Option<unknown>) =>
      Effect.gen(function* () {
        const context = createCliCommandTelemetryContext({
          argv,
          cliVersion: version,
          terminal,
          invocation: invocationContext,
          identity,
          input,
          startedAt,
        });
        if (context.family !== 'execute' || context.argument === undefined) {
          return context;
        }
        const toolkitSlug = yield* toolkitFromToolSlug(context.argument).pipe(
          Effect.provideContext(toolkitLookup)
        );
        return { ...context, toolkitSlug };
      });

    const runHooks = yield* invocationHooks;
    const started = yield* Ref.make(Option.none<CliCommandTelemetryContext>());
    const entered = yield* Ref.make(ROOT_IDENTITY);
    const start = (identity: CommandIdentity, input: Option.Option<unknown>) =>
      contextFor(identity, input).pipe(
        Effect.tap(context => Ref.set(started, Option.some(context))),
        Effect.tap(context => telemetry.invoked(context))
      );
    const invocation: CommandInvocationShape = {
      // Only the first command to begin counts: the bare group whose help ended in `ShowHelp`.
      // A selected command (one with parsed input) runs its hooks first, so the backend mismatch
      // warning precedes the toolkit lookup an `execute` invoked event makes; help (`--help`, a
      // bare group), version, and parse failures run none.
      begin: (identity, input) =>
        Effect.flatMap(Ref.get(started), current =>
          Option.match(current, {
            onSome: () => Effect.void,
            onNone: () =>
              Option.match(input, {
                onNone: () => Effect.void,
                onSome: parsed => runHooks(identity, parsed),
              }).pipe(Effect.andThen(start(identity, input))),
          })
        ),
      enter: identity => Ref.set(entered, identity),
      runId: Effect.map(
        Ref.get(started),
        Option.flatMap(context => Option.fromNullishOr(context.runId))
      ),
    };
    // The command the outcome is reported for: the one that began, else the deepest registration
    // entered, begun now so its invoked event still precedes the outcome.
    const outcomeContext = Effect.flatMap(Ref.get(started), current =>
      Option.match(current, {
        onSome: Effect.succeed,
        onNone: () => Effect.flatMap(Ref.get(entered), identity => start(identity, Option.none())),
      })
    );

    return yield* runWithArgs(argv).pipe(
      Effect.provideService(CommandInvocation, invocation),
      Effect.scoped,
      Effect.mapError(error =>
        CliError.isCliError(error) ? error : mapOnlyComposioOverrideError({ error })
      ),
      Effect.tap(() => Effect.flatMap(outcomeContext, context => telemetry.succeeded(context))),
      Effect.tapCause(cause =>
        Effect.flatMap(outcomeContext, context => telemetry.failed(context, cause))
      )
    );
  });

/**
 * Runs, in order and on stderr, the invocation hooks the selected command's `CommandMeta` keeps,
 * for the input `effect/cli` parsed for it. A group that only shows its help (the bare root
 * included) begins with no input, like `--help`, so it never gets here.
 */
const invocationHooks = Effect.gen(function* () {
  const hooks: Readonly<Record<InvocationHookName, InvocationHookShape>> = {
    backendMismatch: yield* BackendMismatchWarning,
    updateNotice: yield* UpdateNotice,
    pluginHint: yield* PluginHint,
    backgroundUpdateCheck: yield* BackgroundUpdateCheck,
  };
  return (identity: CommandIdentity, input: unknown): Effect.Effect<void> =>
    Effect.forEach(
      INVOCATION_HOOKS.filter(hook => runsHook(identity.meta, hook, input)),
      hook => hooks[hook].run({ identity }),
      { discard: true }
    );
});

/**
 * Whether `reason` has nothing for this module to print: a failure already on screen, or an
 * interruption, which must reach the runner untouched: 128 + n after a signal, else 130 from
 * `Runtime.defaultTeardown`.
 */
const hasNothingToPrint = (reason: Cause.Reason<unknown>): boolean =>
  Cause.isInterruptReason(reason) ||
  (Cause.isFailReason(reason) && !Runtime.getErrorReported(reason.error));

/** Puts the failure `cause` on screen unless it already is, or is an interruption alone. */
const report = (cause: Cause.Cause<unknown>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const error = Cause.findErrorOption(cause);
    // A usage mistake, a missing setup or login, or a failure a remote service reported clearly
    // (see `ExpectedFailure`) is not a broken invariant: its message alone, no defect report.
    const expected = Option.filter(error, isExpectedFailure);
    if (Option.isSome(expected)) {
      yield* ui.error(expected.value.message);
      return;
    }
    // A rejected user API key gets the backend's message and the way to log in again, from
    // whichever command it escaped.
    const rejectedKey = Option.filter(error, isRejectedUserApiKey);
    if (Option.isSome(rejectedKey)) {
      yield* ui.error(extractMessage(rejectedKey.value) ?? 'The user API key was rejected.');
      yield* ui.error(yield* rejectedUserApiKeyHint);
      return;
    }
    // A failure already on screen — `ShowHelp` (`Command.runWith` printed help and any
    // parse/validation errors before failing with it), or a command's own report — must not be
    // printed again, or output doubles. An interruption is no failure to report.
    const unreported = Cause.fromReasons(
      cause.reasons.filter(reason => !hasNothingToPrint(reason))
    );
    if (unreported.reasons.length === 0) {
      return;
    }
    const captured = yield* captureErrors(unreported, { stripCwd: true });
    const message = prettyPrintFromCapturedErrors(captured, {
      hideStackTrace: true,
      stripCwd: true,
      enabled: true,
    }).trim();
    if (message.length > 0) {
      yield* ui.error(message);
    }
  });

/**
 * Puts the failure `cause` on screen once (see {@link report}), then fails with `cause`
 * untouched: a caller can still match its typed error, and an interruption alone stays one, so
 * the runner exits 130 (or 128 + n after a signal) instead of 1.
 */
export const reportInvocationFailure = (cause: Cause.Cause<unknown>) =>
  Effect.andThen(report(cause), Effect.failCause(cause));

/**
 * Runs one invocation of the CLI for the full process `argv` (executable and script included):
 * the command under lifecycle telemetry, with the invocation hooks when it begins.
 *
 * Fails with the command's own cause once it is on screen; an interruption alone is not printed.
 */
export const runInvocation = (
  argv: ReadonlyArray<string>
): Effect.Effect<void, unknown, InvocationServices> =>
  runWithTelemetry(argv).pipe(
    Effect.withSpan('composio-cli', {
      attributes: {
        name: constants.APP_NAME,
        filename: 'src/bin.ts',
      },
    }),
    Effect.catchCause(reportInvocationFailure)
  );

/**
 * The cause the runner receives for a failed invocation. A failure `runInvocation` put on screen
 * becomes a `ReportedFailure`: the runner logs nothing and exits 1. A failure that was on screen
 * before (`ShowHelp`, a command's own report, `ChildProcessExited`) keeps its markers and its
 * exit code, and an interruption stays one, so a signal still decides the exit.
 */
export const runnerCause = (cause: Cause.Cause<unknown>): Cause.Cause<unknown> =>
  cause.reasons.every(hasNothingToPrint)
    ? cause
    : Cause.fail(new ReportedFailure({ message: Cause.pretty(cause) }));

/** `exit` as the runner receives it; see {@link runnerCause}. */
export const runnerExit = <A>(exit: Exit.Exit<A, unknown>): Exit.Exit<A, unknown> =>
  Exit.isSuccess(exit) ? exit : Exit.failCause(runnerCause(exit.cause));

/** Hands `runInvocation`'s result to the runner; see {@link runnerCause}. */
export const forRunner = <A, R>(self: Effect.Effect<A, unknown, R>): Effect.Effect<A, unknown, R> =>
  Effect.catchCause(self, cause => Effect.failCause(runnerCause(cause)));
