import { Context, Deferred, Effect, Layer, type Scope } from 'effect';

/** The signals the CLI's runner handles: Ctrl-C, a polite stop, and a closed terminal. */
export const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

export type StopSignal = (typeof STOP_SIGNALS)[number];

const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

/** The code a shell reports for a process `signal` ended: 130 for SIGINT, 143 for SIGTERM. */
export const signalExitCode = (signal: StopSignal): number => 128 + SIGNAL_NUMBERS[signal];

/** How a command stops by itself when the CLI receives a signal, instead of being interrupted. */
export interface CooperativeStop {
  /** The signals the command handles. Any other signal interrupts it. */
  readonly signals: ReadonlyArray<StopSignal>;
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
  };
};
