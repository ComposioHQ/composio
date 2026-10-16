import { Data } from 'effect';

export class TypeScriptGenerationWriteError extends Data.TaggedError(
  'commands/TypeScriptGenerationWriteError'
)<{
  readonly cause: unknown;
  readonly filePath: string;
  readonly message: string;
}> {}
