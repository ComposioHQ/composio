import { ZodError } from 'zod';

export class ComposioError extends Error {
  private error: Error;

  constructor(messageOrError: string | unknown, error?: unknown) {
    let message: string;
    let err: Error;

    if (error instanceof ZodError) {
      const formattedMessage = error.errors
        .map(e => `Path: ${e.path.join('.') || '(root)'} - ${e.message}`)
        .join('; ');
      message = `${messageOrError}: ${formattedMessage}`;
      err = error;
    } else {
      message = typeof messageOrError === 'string' ? messageOrError : String(messageOrError);
      err = error as Error;
    }

    super(message);
    this.error = err;

    // Capture the stack trace of the caller
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ComposioError);
    }
  }

  /**
   * Static method to handle Zod errors.
   * If the provided error is a ZodError, it formats the error message and returns a new ComposioError.
   * Otherwise, it returns a new ComposioError with the original message and error.
   */
  static fromZodError(message: string, error: unknown): ComposioError {
    if (error instanceof ZodError) {
      const formattedMessage = error.errors
        .map(e => `Path: ${e.path.join('.') || '(root)'} - ${e.message}`)
        .join('; ');
      return new ComposioError(`${message}: ${formattedMessage}`, error);
    }
    return new ComposioError(message, error as Error);
  }
}
