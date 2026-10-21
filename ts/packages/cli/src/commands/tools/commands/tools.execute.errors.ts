import { Data } from 'effect';

type ToolExecutionErrorFields = {
  readonly reason:
    | 'invalid_arguments'
    | 'file_input'
    | 'connected_account'
    | 'missing_user_id'
    | 'connection_check'
    | 'execution_failed'
    | 'parallel_failed';
  readonly message: string;
  readonly toolSlug?: string;
  readonly cause?: unknown;
};

/** `composio execute` cannot run the tool as invoked. */
export class ToolExecutionError extends Data.TaggedError(
  'ToolExecutionError'
)<ToolExecutionErrorFields> {}

/**
 * A failed execution whose result is already on stdout as `{ "successful": false, ... }`.
 * `cli-main.ts` prints nothing more for it and exits 1.
 */
export class ReportedToolExecutionError extends Data.TaggedError(
  'ReportedToolExecutionError'
)<ToolExecutionErrorFields> {}
