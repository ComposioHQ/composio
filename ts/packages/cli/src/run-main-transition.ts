/**
 * The runner's decisions as a pure transition, so `src/run-main.ts` and its model check
 * (`test/src/run-main.model.test.ts`) share one implementation. Keep it free of runtime imports.
 */
import type { StopSignal } from 'src/services/shutdown-signal';

export interface RunnerState {
  /** The first stop signal the process received. */
  readonly received: StopSignal | undefined;
  /** The process is already ending; later events change nothing. */
  readonly finished: boolean;
}

export type RunnerEvent =
  | { readonly kind: 'Signal'; readonly signal: StopSignal }
  /** The shutdown deadline after the first signal elapsed. */
  | { readonly kind: 'Deadline' }
  /** The main fiber ended; `cleanSuccess` when its exit action is exit code 0. */
  | { readonly kind: 'Exited'; readonly cleanSuccess: boolean };

export type RunnerCommand =
  /** Arm the deadline, then hand `signal` to a cooperating command or interrupt the fiber. */
  | { readonly kind: 'Stop'; readonly signal: StopSignal }
  /** Run the cooperating commands' `onForce` and end now, reporting `signal`. */
  | { readonly kind: 'Force'; readonly signal: StopSignal }
  /** End with the fiber's exit action. */
  | { readonly kind: 'End' }
  /** A clean success nobody signalled: release the handlers and let the event loop drain. */
  | { readonly kind: 'Drain' }
  | { readonly kind: 'Ignore' };

export interface RunnerTransition {
  readonly state: RunnerState;
  readonly command: RunnerCommand;
}

export const initialRunnerState: RunnerState = { received: undefined, finished: false };

/**
 * The first signal stops the command; a second signal, or the deadline, forces the exit. The
 * process ends once: whatever arrives after that is ignored.
 */
export const runnerTransition = (state: RunnerState, event: RunnerEvent): RunnerTransition => {
  if (state.finished) {
    return { state, command: { kind: 'Ignore' } };
  }
  const ending = { ...state, finished: true };
  switch (event.kind) {
    case 'Signal':
      return state.received === undefined
        ? {
            state: { ...state, received: event.signal },
            command: { kind: 'Stop', signal: event.signal },
          }
        : { state: ending, command: { kind: 'Force', signal: event.signal } };
    case 'Deadline':
      return state.received === undefined
        ? { state, command: { kind: 'Ignore' } }
        : { state: ending, command: { kind: 'Force', signal: state.received } };
    case 'Exited':
      return {
        state: ending,
        command: { kind: state.received === undefined && event.cleanSuccess ? 'Drain' : 'End' },
      };
  }
};
