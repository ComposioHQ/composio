/**
 * The CLI's main runner, in place of `BunRuntime.runMain`: it owns the process signal handlers
 * and decides how the process ends. A runtime boundary, like `bin.ts`.
 *
 * - The first SIGINT, SIGTERM or SIGHUP goes to a command that cooperates on it (see
 *   `ShutdownSignal`), which stops by itself; any other command is interrupted.
 * - An exit made of interruptions alone, after a signal, is reported as 128 + the signal's number
 *   (130, 143, 129). Otherwise `Runtime.defaultTeardown` picks the exit code from Effect's
 *   runtime markers.
 * - A second signal, or a first one whose stop outlives {@link SHUTDOWN_DEADLINE}, forces the
 *   exit without waiting for finalizers.
 */
import process from 'node:process';
import { Cause, Duration, Exit, Option, Runtime } from 'effect';
import {
  STOP_SIGNALS,
  signalExitCode,
  type ShutdownController,
  type StopSignal,
} from 'src/services/shutdown-signal';

/** How long a stop may take after the first signal before the runner forces the exit. */
export const SHUTDOWN_DEADLINE = Duration.seconds(10);

/**
 * A command interrupted by a signal exits with 128 + the signal's number. Otherwise `teardown`
 * (by default `Runtime.defaultTeardown`) chooses the exit code.
 */
export const exitCodeFor = (
  exit: Exit.Exit<unknown, unknown>,
  received: Option.Option<StopSignal>,
  teardown: Runtime.Teardown = Runtime.defaultTeardown
): number => {
  if (Exit.isFailure(exit) && Option.isSome(received) && Cause.hasInterruptsOnly(exit.cause)) {
    return signalExitCode(received.value);
  }
  let code = 1;
  teardown(exit, teardownCode => {
    code = teardownCode;
  });
  return code;
};

/** The process operations the runner needs, replaceable in tests. */
export interface RunnerPlatform {
  readonly on: (signal: StopSignal, listener: () => void) => void;
  readonly off: (signal: StopSignal, listener: () => void) => void;
  readonly exit: (code: number) => void;
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
    let received = Option.none<StopSignal>();
    let finished = false;
    let cancelDeadline = () => {};

    const listeners = STOP_SIGNALS.map(signal => ({ signal, listener: () => onSignal(signal) }));
    const release = () => {
      cancelDeadline();
      listeners.forEach(({ signal, listener }) => platform.off(signal, listener));
    };
    const finish = (code: number) => {
      if (finished) {
        return;
      }
      finished = true;
      release();
      platform.exit(code);
    };
    const force = (signal: StopSignal) => finish(signalExitCode(signal));
    const onSignal = (signal: StopSignal) => {
      if (Option.isSome(received)) {
        force(signal);
        return;
      }
      received = Option.some(signal);
      cancelDeadline = platform.schedule(Duration.toMillis(SHUTDOWN_DEADLINE), () => force(signal));
      if (!controller.offer(signal)) {
        fiber.interruptUnsafe(fiber.id);
      }
    };

    listeners.forEach(({ signal, listener }) => platform.on(signal, listener));
    fiber.addObserver(exit => {
      const code = exitCodeFor(exit, received, teardown);
      // Like `BunRuntime.runMain`: a clean success nobody signalled ends when the event loop
      // drains, so pending output is flushed.
      if (Option.isNone(received) && code === 0) {
        finished = true;
        release();
        return;
      }
      finish(code);
    });
  });
