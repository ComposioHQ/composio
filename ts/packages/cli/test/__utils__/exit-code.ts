import { Option, type Exit } from 'effect';
import { runnerExit } from 'src/invocation/invocation';
import { exitCodeFor } from 'src/run-main';

/**
 * The code the CLI process exits with when an invocation ends with `exit` and no signal arrived,
 * mapped the way `runCli` maps it: `runnerExit`, then `exitCodeFor`.
 */
export const exitCodeOf = (exit: Exit.Exit<unknown, unknown>): number =>
  exitCodeFor(runnerExit(exit), Option.none());
