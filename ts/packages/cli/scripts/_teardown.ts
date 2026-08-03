import process from 'node:process';
import { Cause, Exit } from 'effect';
import type { Teardown } from '@effect/platform/Runtime';

/**
 * Shared teardown for CLI scripts.
 *
 * Keep this module dependency-light so release-only scripts can use it without
 * loading the CLI runtime or requiring built workspace packages.
 */
export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};
