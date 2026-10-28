import { Option, type Exit } from 'effect';
import { runnerExit } from 'src/invocation/invocation';
import { ExitAction, exitActionFor } from 'src/run-main';
import { signalExitCode } from 'src/services/shutdown-signal';

/**
 * The code the CLI process exits with when an invocation ends with `exit` and no signal arrived,
 * mapped the way `runCli` maps it: `forRunner`, then the runner's `exitActionFor` (by way of
 * `Runtime.defaultTeardown`). 0 on success, otherwise the failure's `[Runtime.errorExitCode]`,
 * or 1 without one; a child `composio run` a signal ended reports 128 + its number, as a shell
 * would for the re-raised signal.
 */
export const exitCodeOf = (exit: Exit.Exit<unknown, unknown>): number =>
  ExitAction.$match(exitActionFor(runnerExit(exit), Option.none()), {
    ExitWith: ({ code }) => code,
    Reraise: ({ signal }) => signalExitCode(signal),
  });
