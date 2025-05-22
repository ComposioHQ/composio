// packages/core/src/errors/ValidationError.ts

import { ZodError } from 'zod';
import { ComposioError, ComposioErrorOptions } from './ComposioError';

/**
 * Represents an input validation error using Zod.
 */
export const ValidationErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export class ValidationError extends ComposioError {
  constructor(message: string = 'Input validation failed', options: ComposioErrorOptions = {}) {
    // Extract and process the ZodError
    const { cause: providedZodError, ...restOptions } = options;

    // Determine the ZodError instance to use
    let zodErrorInstance: ZodError;
    if (providedZodError instanceof ZodError) {
      zodErrorInstance = providedZodError;
    } else {
      zodErrorInstance = new ZodError([
        {
          path: [],
          message: 'Invalid input',
          code: 'custom',
        },
      ]);
    }

    // Format validation issues for the cause
    const issues = zodErrorInstance.issues.map(
      issue => `[${issue.code}] ${issue.path.join('.')} - ${issue.message}`
    );

    super(message, {
      ...restOptions,
      code: options.code || ValidationErrorCodes.VALIDATION_ERROR,
      possibleFixes: issues,
      cause: zodErrorInstance,
    });

    this.name = 'ValidationError';

    // Capture the original stack trace from where the error occurred
    // Error.captureStackTrace(this, this.constructor);

    // Create a friendly error message for users
    const userFriendlyMessage = this.generateUserFriendlyMessage();
    this.message = `${message}: ${userFriendlyMessage}`;
  }

  private generateUserFriendlyMessage(): string {
    // Extract the most relevant information from the ZodError
    if (this.cause instanceof ZodError && this.cause.issues.length > 0) {
      const issue = this.cause.issues[0];
      const path = issue.path.join('.');
      const param = path || 'parameter';

      // Create specific messages based on error code
      if (issue.code === 'invalid_type') {
        return `The ${param} should be a ${issue.expected}, but you provided a ${issue.received}`;
      }

      return issue.message;
    }

    return 'Please check your input parameters';
  }
}
