// packages/core/src/errors/ValidationError.ts

import { ZodError } from 'zod';
import { ComposioError } from './ComposioError';
import { error } from 'console';

/**
 * Represents an input validation error using Zod.
 */
export const ValidationErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export class ValidationError extends ComposioError {
  public readonly zodError: ZodError;

  constructor(zodError: ZodError, message = 'Input validation failed') {
    // check if it is a zod error, or else fallback to a generic error
    let zodErrorInstance: ZodError;
    if (!(zodError instanceof ZodError)) {
      zodErrorInstance = new ZodError([
        {
          path: [],
          message: 'Invalid input',
          code: 'custom',
        },
      ]);
    } else {
      zodErrorInstance = zodError;
    }
    super(message, {
      code: ValidationErrorCodes.VALIDATION_ERROR,
      meta: {
        issues: zodErrorInstance.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
      cause: zodErrorInstance,
    });
    this.zodError = zodErrorInstance;
  }
}
