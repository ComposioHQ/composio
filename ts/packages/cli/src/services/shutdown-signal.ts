import { Context, Deferred, Effect, Layer, Schema, type Scope } from 'effect';

/**
 * Signals whose numbers agree on Linux and macOS, so `128 + n` is the code a shell reports for
 * a process they end. Others (`SIGUSR1`, `SIGBUS`, …) differ between platforms.
 */
const SIGNAL_NUMBERS = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
} as const;

/** A signal that can end a process, with the same number on every platform the CLI ships for. */
export type TerminationSignal = keyof typeof SIGNAL_NUMBERS;

export const isTerminationSignal = Schema.is(
  Schema.Literals([
    'SIGHUP',
    'SIGINT',
    'SIGQUIT',
    'SIGILL',
    'SIGTRAP',
    'SIGABRT',
    'SIGFPE',
    'SIGKILL',
    'SIGSEGV',
    'SIGPIPE',
    'SIGALRM',
    'SIGTERM',
  ] satisfies ReadonlyArray<TerminationSignal>)
);

/** The code a shell reports for a process `signal` ended: 130 for SIGINT, 143 for SIGTERM. */
export const signalExitCode = (signal: TerminationSignal): number => 128 + SIGNAL_NUMBERS[signal];

/** The signals the CLI's runner handles: Ctrl-C, a polite stop, and a closed terminal. */
export const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

export type StopSignal = (typeof STOP_SIGNALS)[number];

/** How a command stops by itself when the CLI receives a signal, instead of being interrupted. */
export interface CooperativeStop {
  /** The signals the command handles. Any other signal interrupts it. */
  readonly signals: ReadonlyArray<StopSignal>;
  /**
   * Runs synchronously when a second signal, or the shutdown deadline, forces the CLI to exit
   * before the command finished stopping: the last chance to kill what the command started.
   */
  readonly onForce?: () => void;
  /** Ends a forced exit by re-raising the signal (`composio run`) rather than exiting 128 + n. */
  readonly reraiseOnForce?: boolean;
}

export interface ShutdownSignalShape {
  /**
   * Handles `stop.signals` cooperatively for the life of the current scope: the first such
   * signal completes `requested` instead of interrupting the command. Register right after the
   * command acquired what it has to release; a signal before that still interrupts it.
   */
  readonly cooperate: (stop: CooperativeStop) => Effect.Effect<void, never, Scope.Scope>;
  /** Completes with the first signal a cooperative command took. */
  readonly requested: Effect.Effect<StopSignal>;
}

/**
 * The signal the CLI process received, for the one invocation that runs in it. The runner
 * (`src/run-main.ts`) owns the process signal handlers and hands the signal to a command that
 * cooperates; every other command is interrupted.
 */
export class ShutdownSignal extends Context.Service<ShutdownSignal, ShutdownSignalShape>()(
  'services/ShutdownSignal'
) {
  /** A service no runner signals: for tests and invocations without process signals. */
  static readonly Default: Layer.Layer<ShutdownSignal> = Layer.sync(
    ShutdownSignal,
    () => makeShutdownController().service
  );
}

/**
 * How a listener (`composio listen`, `dev triggers listen`) stops: Ctrl-C and SIGTERM are the
 * documented way to end it, so it stops cleanly and exits 0. A closed terminal (SIGHUP) still
 * interrupts it and exits 129.
 */
export const LISTENER_STOP: CooperativeStop = { signals: ['SIGINT', 'SIGTERM'] };

/** The runner's side of {@link ShutdownSignal}. */
export interface ShutdownController {
  readonly service: ShutdownSignalShape;
  /** Gives `signal` to a command that cooperates on it; `false` when the runner must interrupt. */
  readonly offer: (signal: StopSignal) => boolean;
  /** Runs every cooperating command's `onForce`; says whether the forced exit re-raises. */
  readonly force: () => { readonly reraise: boolean };
}

export const makeShutdownController = (): ShutdownController => {
  const requested = Deferred.makeUnsafe<StopSignal>();
  const active = new Set<CooperativeStop>();
  return {
    service: ShutdownSignal.of({
      cooperate: stop =>
        Effect.acquireRelease(
          // A fresh entry per registration, so registering one value twice is two registrations.
          Effect.sync(() => {
            const entry = { ...stop };
            active.add(entry);
            return entry;
          }),
          entry => Effect.sync(() => active.delete(entry))
        ),
      requested: Deferred.await(requested),
    }),
    offer: signal =>
      [...active].some(stop => stop.signals.includes(signal)) &&
      Deferred.doneUnsafe(requested, Effect.succeed(signal)),
    force: () => {
      const stops = [...active];
      stops.forEach(stop => stop.onForce?.());
      return { reraise: stops.some(stop => stop.reraiseOnForce === true) };
    },
  };
};
