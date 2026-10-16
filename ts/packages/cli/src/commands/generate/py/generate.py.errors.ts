import { Data } from 'effect';

export class PythonGenerationWriteError extends Data.TaggedError(
  'commands/PythonGenerationWriteError'
)<{
  readonly cause: unknown;
  readonly filePath: string;
  readonly message: string;
}> {}
