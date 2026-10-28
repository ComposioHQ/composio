import { Data, Runtime } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { ExpectedFailure } from 'src/effects/expected-failure';

// Also raised by the hand-rolled `--parallel` mini-parser (`parseParallelExecuteArgs` in `tools.execute.parallel.ts`).
export const invalidArguments = commandInputError('execute');

// The reasons below are the ones this command constructs each error with; TypeScript cannot infer a
// union from scattered constructor calls, so a new reason is added here next to its first use.

/**
 * `composio execute` cannot run the tool as invoked: a `--file` the tool cannot take, no user
 * id to run it for, or (with `--parallel`) a toolkit the user has not connected. An expected
 * failure: the invocation prints the message and exits 1.
 */
export class ToolExecutionError extends Data.TaggedError('ToolExecutionError')<{
  readonly reason: 'file_input' | 'missing_user_id' | 'connection_check';
  readonly message: string;
  readonly toolSlug?: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/**
 * A failed execution whose result is already on stdout as `{ "successful": false, ... }`.
 * The runtime prints nothing more for it (`[Runtime.errorReported]` is false) and exits 1.
 */
export class ReportedToolExecutionError extends Data.TaggedError('ReportedToolExecutionError')<{
  readonly reason: 'connection_check' | 'execution_failed' | 'parallel_failed';
  readonly message: string;
  readonly toolSlug?: string;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return 1;
  }
}
