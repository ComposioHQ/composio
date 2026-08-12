import { Data } from 'effect';

export class BinaryBuildError extends Data.TaggedError('scripts/BinaryBuildError')<{
  readonly message: string;
  readonly target?: string;
  readonly exitCode: number;
}> {}
