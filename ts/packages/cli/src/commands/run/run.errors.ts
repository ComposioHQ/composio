import { Data } from 'effect';
import type { TerminationSignal } from 'src/services/shutdown-signal';

export class ChildSignalError extends Data.TaggedError('ChildSignalError')<{
  readonly pid: number;
  readonly signal: TerminationSignal;
  readonly cause: unknown;
}> {}
