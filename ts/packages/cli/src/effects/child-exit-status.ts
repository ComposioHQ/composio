import { Effect, Option, type PlatformError } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { isTerminationSignal, type TerminationSignal } from 'src/services/shutdown-signal';

/** How a child process ended: with an exit code, or killed by a signal. */
export type ChildExitStatus =
  | { readonly code: number; readonly signal: null }
  | { readonly code: null; readonly signal: TerminationSignal };

/**
 * The cause message `@effect/platform-node-shared`'s spawner fails `exitCode` with when a signal
 * ended the child. The spawner has Node's `(code, signal)` pair but keeps only this message.
 */
const SIGNAL_DEATH = /^Process interrupted due to receipt of signal: '([A-Z0-9]+)'$/u;

const signalOf = (error: PlatformError.PlatformError): Option.Option<TerminationSignal> =>
  error.reason.method === 'exitCode' && error.reason.cause instanceof Error
    ? Option.fromNullishOr(SIGNAL_DEATH.exec(error.reason.cause.message)?.[1]).pipe(
        Option.filter(isTerminationSignal)
      )
    : Option.none();

/**
 * Waits for `child` and reports its `{ code, signal }`, which `handle.exitCode` drops for a child
 * a signal ended (it fails instead). A signal outside `TerminationSignal`, or any other failure,
 * stays the spawner's `PlatformError`.
 */
export const childExitStatus = (
  child: ChildProcessSpawner.ChildProcessHandle
): Effect.Effect<ChildExitStatus, PlatformError.PlatformError> =>
  child.exitCode.pipe(
    Effect.map((code): ChildExitStatus => ({ code: Number(code), signal: null })),
    Effect.catchTag('PlatformError', error =>
      Option.match(signalOf(error), {
        onNone: () => Effect.fail(error),
        onSome: signal => Effect.succeed<ChildExitStatus>({ code: null, signal }),
      })
    )
  );
