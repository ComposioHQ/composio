import { Runtime, type Exit } from 'effect';

/**
 * The code the CLI process exits with for `exit`, as `Runtime.defaultTeardown` (the teardown
 * `BunRuntime.runMain` runs) picks it: 0 on success, 130 on interruption alone, otherwise the
 * failure's `[Runtime.errorExitCode]`, or 1 without one.
 */
export const exitCodeOf = (exit: Exit.Exit<unknown, unknown>): number => {
  let code: number | undefined;
  Runtime.defaultTeardown(exit, exitCode => {
    code = exitCode;
  });
  if (code === undefined) {
    throw new Error('Runtime.defaultTeardown did not report an exit code.');
  }
  return code;
};
