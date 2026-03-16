import process from 'node:process';
import { Cause, Exit } from 'effect';
import type { Teardown } from '@effect/platform/Runtime';

/**
 * Shared teardown for all CLI scripts.
 *
 * Exits with a non-zero code when the Effect program fails
 * (unless the failure is an interrupt-only cause).
 */
export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};
