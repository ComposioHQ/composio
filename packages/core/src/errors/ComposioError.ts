/**
 * @fileoverview Error class for Composio.
 *
 * This error class is used to create custom errors for Composio.
 * It extends the built-in Error class and adds additional properties for code, status code, cause, meta, and possible fixes.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @module errors/ComposioError
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error}
 */
export type ComposioErrorOptions = {
  code?: string;
  statusCode?: number;
  cause?: unknown;
  meta?: Record<string, unknown>;
  possibleFixes?: string[];
};
export class ComposioError extends Error {
  public name = 'ComposioError';
  public readonly code?: string;
  public readonly statusCode?: number;
  public readonly cause?: unknown;
  public readonly meta?: Record<string, unknown>;
  public readonly possibleFixes?: string[];

  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message);
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.cause = options.cause;
    this.meta = options.meta;
    this.possibleFixes = options.possibleFixes;

    // Captures stack trace excluding the constructor frame
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
      meta: this.meta,
      possibleFixes: this.possibleFixes?.length ? this.possibleFixes.join('\n') : undefined,
    };
  }
}
