// packages/core/src/errors/ValidationError.ts

import { ZodError } from 'zod';
import { ComposioError } from './ComposioError';

/**
 * Represents an input validation error using Zod.
 */
export const ValidationErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export class ValidationError extends ComposioError {
  public readonly zodError: ZodError;

  constructor(
    zodError: ZodError,
    message = 'Input validation failed',
    meta?: Record<string, unknown>
  ) {
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
    const issues = zodErrorInstance.issues.map(
      issue => `[${issue.code}] ${issue.path.join('.')} - ${issue.message}`
    );

    super(message, {
      code: ValidationErrorCodes.VALIDATION_ERROR,
      meta: meta,
      cause: issues.join('\n'),
    });
    this.zodError = zodErrorInstance;
    this.name = 'ValidationError';
  }
}
