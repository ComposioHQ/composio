/**
 * The CLI's main runner, in place of `BunRuntime.runMain`: it owns the process signal handlers
 * and decides how the process ends. A runtime boundary, like `bin.ts`.
 *
 * - The first SIGINT, SIGTERM or SIGHUP goes to a command that cooperates on it (see
 *   `ShutdownSignal`), which stops by itself; any other command is interrupted.
 * - An exit made of interruptions alone, after a signal, is reported as 128 + the signal's number
 *   (130, 143, 129); a child `composio run` mirrors that a signal ended is re-raised; anything
 *   else exits with the code `Runtime.defaultTeardown` picks from Effect's runtime markers.
 * - A second signal, or a first one whose stop outlives {@link SHUTDOWN_DEADLINE}, forces the
 *   exit without waiting for finalizers.
 */
import process from 'node:process';
import { Cause, Data, Duration, Exit, Option, Runtime } from 'effect';
import { ChildProcessSignaled } from 'src/effects/child-process-exited';
import {
  initialRunnerState,
  runnerTransition,
  type RunnerCommand,
  type RunnerEvent,
} from 'src/run-main-transition';
import {
  STOP_SIGNALS,
  signalExitCode,
  type ShutdownController,
  type StopSignal,
  type TerminationSignal,
} from 'src/services/shutdown-signal';

/** How long a stop may take after the first signal before the runner forces the exit. */
export const SHUTDOWN_DEADLINE = Duration.seconds(10);

/** How long a re-raised signal has to end the process before it exits 128 + n instead. */
const RERAISE_FALLBACK = Duration.seconds(1);

export type ExitAction = Data.TaggedEnum<{
  /** Exit with this code. */
  ExitWith: { readonly code: number };
  /** End the process with this signal, the way the child it mirrors ended. */
  Reraise: { readonly signal: TerminationSignal };
}>;

export const ExitAction = Data.taggedEnum<ExitAction>();

/**
 * How the process ends for `exit`, given the first signal it received.
 *
 * A child that a signal ended is mirrored by re-raising that signal. A run cancelled by a signal
 * (interruptions alone) exits 128 + the signal's number. Everything else, a cooperative stop
 * included, is what `teardown` (by default `Runtime.defaultTeardown`) picks: 0 on success, 130
 * on an interruption no signal caused, otherwise the failure's `[Runtime.errorExitCode]`.
 */
export const exitActionFor = (
  exit: Exit.Exit<unknown, unknown>,
  received: Option.Option<StopSignal>,
  teardown: Runtime.Teardown = Runtime.defaultTeardown
): ExitAction => {
  if (Exit.isFailure(exit)) {
    const squashed = Cause.squash(exit.cause);
    if (squashed instanceof ChildProcessSignaled) {
      return ExitAction.Reraise({ signal: squashed.signal });
    }
    if (Option.isSome(received) && Cause.hasInterruptsOnly(exit.cause)) {
      return ExitAction.ExitWith({ code: signalExitCode(received.value) });
    }
  }
  let code = 1;
  teardown(exit, teardownCode => {
    code = teardownCode;
  });
  return ExitAction.ExitWith({ code });
};

/** The process operations the runner needs, replaceable in tests. */
export interface RunnerPlatform {
  readonly on: (signal: StopSignal, listener: () => void) => void;
  readonly off: (signal: StopSignal, listener: () => void) => void;
  readonly exit: (code: number) => void;
  /** Ends the process with `signal`, as the default action of that signal would. */
  readonly raise: (signal: TerminationSignal) => void;
  /** Runs `f` after `millis`; the returned function cancels it. */
  readonly schedule: (millis: number, f: () => void) => () => void;
}

const processPlatform: RunnerPlatform = {
  on: (signal, listener) => {
    process.on(signal, listener);
  },
  off: (signal, listener) => {
    process.removeListener(signal, listener);
  },
  exit: code => process.exit(code),
  raise: signal => {
    // The runner removed its own handlers first, so the signal's default action ends the
    // process and the caller's `wait` sees it signalled. Another listener, or an ignored signal,
    // would keep it alive; the timer makes sure it still ends.
    setTimeout(() => process.exit(signalExitCode(signal)), Duration.toMillis(RERAISE_FALLBACK));
    process.kill(process.pid, signal);
  },
  schedule: (millis, f) => {
    const timer = setTimeout(f, millis);
    return () => clearTimeout(timer);
  },
};

/** A `runMain` that reports to `controller` the signals the process receives. */
export const makeCliRunMain = (
  controller: ShutdownController,
  platform: RunnerPlatform = processPlatform
) =>
  Runtime.makeRunMain(({ fiber, teardown }) => {
    // Every decision goes through `runnerTransition`, which test/src/run-main.model.test.ts
    // model checks; this closure only performs the commands it returns.
    let state = initialRunnerState;
    let cancelDeadline = () => {};
    const step = (event: RunnerEvent): RunnerCommand => {
      const transition = runnerTransition(state, event);
      state = transition.state;
      return transition.command;
    };

    const listeners = STOP_SIGNALS.map(signal => ({
      signal,
      listener: () => perform(step({ kind: 'Signal', signal })),
    }));
    const release = () => {
      cancelDeadline();
      listeners.forEach(({ signal, listener }) => platform.off(signal, listener));
    };
    const end = (action: ExitAction) => {
      release();
      ExitAction.$match(action, {
        ExitWith: ({ code }) => platform.exit(code),
        Reraise: ({ signal }) => platform.raise(signal),
      });
    };
    const perform = (command: RunnerCommand, exitAction?: ExitAction) => {
      switch (command.kind) {
        case 'Stop':
          cancelDeadline = platform.schedule(Duration.toMillis(SHUTDOWN_DEADLINE), () =>
            perform(step({ kind: 'Deadline' }))
          );
          if (!controller.offer(command.signal)) {
            fiber.interruptUnsafe(fiber.id);
          }
          return;
        case 'Force':
          // Kill what cooperating commands started, then end now: a forced `composio run`
          // re-raises the signal like the child it supervises would have died; anything else
          // exits 128 + n.
          return end(
            controller.force().reraise
              ? ExitAction.Reraise({ signal: command.signal })
              : ExitAction.ExitWith({ code: signalExitCode(command.signal) })
          );
        case 'End':
          return exitAction === undefined ? undefined : end(exitAction);
        case 'Drain':
          // Like `BunRuntime.runMain`: a clean success nobody signalled ends when the event
          // loop drains, so pending output is flushed.
          return release();
        case 'Ignore':
          return;
      }
    };

    listeners.forEach(({ signal, listener }) => platform.on(signal, listener));
    fiber.addObserver(exit => {
      const action = exitActionFor(exit, Option.fromUndefinedOr(state.received), teardown);
      const cleanSuccess = ExitAction.$is('ExitWith')(action) && action.code === 0;
      perform(step({ kind: 'Exited', cleanSuccess }), action);
    });
  });
