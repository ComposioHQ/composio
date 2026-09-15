import { Data } from 'effect';

export type SetupFailureReasonCode =
  | 'all_requires_both_hosts'
  | 'unsupported_host'
  | 'target_not_installed'
  | 'no_host_detected'
  | 'non_interactive_requires_yes'
  | 'marketplace_conflict'
  | 'unknown';

export class SetupCommandError extends Data.TaggedError('services/SetupCommandError')<{
  readonly message: string;
  readonly operation: 'setup' | 'uninstall';
  readonly reasonCode: SetupFailureReasonCode;
  readonly cause?: unknown;
}> {}

export const setupFailureReasonCodeOf = (error: unknown): SetupFailureReasonCode => {
  if (error instanceof SetupCommandError) return error.reasonCode;
  return 'unknown';
};
