import { Data } from 'effect';

// The generation pipeline runs inside the `generation-runtime` companion module,
// a separately bundled file with its own copy of these classes. Errors cross
// back into the CLI as plain values, so this module has no compiler import and
// `rehydrateGenerationError` rebuilds them as instances of the CLI's classes,
// which keeps `_tag` handling and error rendering exactly as before.

export class SafeOutputPathError extends Data.TaggedError('generation/SafeOutputPathError')<{
  readonly filename: string;
  readonly outputDir: string;
  readonly resolvedPath: string;
  readonly message: string;
}> {}

export class TypeScriptTranspileError extends Data.TaggedError('error/TypeScriptTranspileError')<{
  readonly message: string;
  readonly cause: string;
}> {}

export class GenerateTypeFromJsonSchemaError extends Data.TaggedError('json-parsing-error')<{
  cause?: unknown;
  message?: string;
}> {}

export type GenerationError =
  SafeOutputPathError | TypeScriptTranspileError | GenerateTypeFromJsonSchemaError;

const withOriginalStack = <E extends Error>(error: E, original: Error): E => {
  if (typeof original.stack === 'string') {
    Object.defineProperty(error, 'stack', { value: original.stack, configurable: true });
  }
  return error;
};

/**
 * Rebuilds a generation error produced by the companion module as an instance
 * of this module's class, carrying over its fields and stack.
 */
export const rehydrateGenerationError = (error: GenerationError): GenerationError => {
  switch (error._tag) {
    case 'generation/SafeOutputPathError':
      return withOriginalStack(
        new SafeOutputPathError({
          filename: error.filename,
          outputDir: error.outputDir,
          resolvedPath: error.resolvedPath,
          message: error.message,
        }),
        error
      );
    case 'error/TypeScriptTranspileError':
      return withOriginalStack(
        new TypeScriptTranspileError({ message: error.message, cause: error.cause }),
        error
      );
    case 'json-parsing-error':
      return withOriginalStack(
        new GenerateTypeFromJsonSchemaError({ cause: error.cause, message: error.message }),
        error
      );
  }
};
