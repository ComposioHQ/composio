import { Effect } from 'effect';
import { type Cause, hasInterruptsOnly } from 'effect/Cause';
import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';

import type { JsonParsingError } from 'effect-errors/dependencies/fs';
import { captureErrorsFrom } from 'effect-errors/logic/errors';
import {
  type ErrorLocation,
  type ErrorRelatedSources,
  transformRawError,
} from 'effect-errors/sourcemaps';
import type { ErrorSpan } from 'effect-errors/types';

export interface ErrorData {
  errorType: unknown;
  message: unknown;
  stack: string[] | undefined;
  sources: Omit<ErrorRelatedSources, '_tag'>[] | undefined;
  location: Omit<ErrorLocation, '_tag'>[] | undefined;
  spans: ReadonlyArray<ErrorSpan> | undefined;
  isPlainString: boolean;
}

export interface CapturedErrors {
  interrupted: boolean;
  errors: ErrorData[];
}

export interface CaptureErrorsOptions {
  stripCwd?: boolean;
}

export const captureErrors = <E>(
  cause: Cause<E>,
  options: CaptureErrorsOptions = {
    stripCwd: true,
  }
): Effect.Effect<CapturedErrors, PlatformError | JsonParsingError, FileSystem | Path> =>
  Effect.gen(function* () {
    if (hasInterruptsOnly(cause)) {
      return {
        interrupted: true,
        errors: [],
      };
    }

    const rawErrors = captureErrorsFrom<E>(cause);
    const errors = yield* Effect.forEach(rawErrors, transformRawError(options));

    return {
      interrupted: false,
      errors,
    };
  });
