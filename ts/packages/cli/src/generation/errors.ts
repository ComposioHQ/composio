import { Data } from 'effect';

export class SafeOutputPathError extends Data.TaggedError('generation/SafeOutputPathError')<{
  readonly filename: string;
  readonly outputDir: string;
  readonly resolvedPath: string;
  readonly message: string;
}> {}

export class GenerateTypeFromJsonSchemaError extends Data.TaggedError('json-parsing-error')<{
  cause?: unknown;
  message?: string;
}> {}
