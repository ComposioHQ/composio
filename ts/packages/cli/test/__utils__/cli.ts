import { Effect } from 'effect';
import { runInvocation } from 'src/invocation/invocation';
import { exitCodeOf } from './exit-code';

/**
 * Runs the CLI with `args` (no executable prefix) through the full invocation, the one the binary
 * runs: invocation hooks, lifecycle telemetry, the command, and its failure on stderr. Fails with
 * the command's own error, so `Effect.flip` and tag matching see it.
 */
export const cli = (args: ReadonlyArray<string>) => runInvocation(['node', '<CMD>', ...args]);

/** Runs `cli(args)` and reports how it ended, with the code the process would exit with. */
export const cliExit = (args: ReadonlyArray<string>) =>
  Effect.map(Effect.exit(cli(args)), exit => ({ exit, exitCode: exitCodeOf(exit) }));
