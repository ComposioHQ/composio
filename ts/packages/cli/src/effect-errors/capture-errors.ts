import type { FileSystem } from '@effect/platform/FileSystem';
import type { Path } from '@effect/platform/Path';
import { Effect } from 'effect';
import { type Cause, isInterruptedOnly } from 'effect/Cause';

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
  spans: ErrorSpan[] | undefined;
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
): Effect.Effect<CapturedErrors, never, FileSystem | Path> =>
  Effect.gen(function* () {
    if (isInterruptedOnly(cause)) {
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
