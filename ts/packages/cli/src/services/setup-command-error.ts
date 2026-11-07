import { Data, Runtime } from 'effect';

export type SetupFailureReasonCode =
  | 'all_requires_both_hosts'
  | 'unsupported_host'
  | 'target_not_installed'
  | 'no_host_detected'
  | 'non_interactive_requires_yes'
  | 'marketplace_conflict'
  | 'unknown';

/**
 * Why `composio setup` failed. The `setup` command renders it, with its outro, before failing, so
 * the runtime prints nothing more (`[Runtime.errorReported]` is false) and exits 1.
 */
export class SetupCommandError extends Data.TaggedError('services/SetupCommandError')<{
  readonly message: string;
  readonly operation: 'setup' | 'uninstall';
  readonly reasonCode: SetupFailureReasonCode;
  readonly cause?: unknown;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return 1;
  }
}
