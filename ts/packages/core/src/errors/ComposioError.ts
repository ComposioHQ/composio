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
import chalk from 'chalk';
import { ZodError } from 'zod/v3';
import { BadRequestError } from '@composio/client';
import logger from '../utils/logger';

/**
 * Options for error handling
 */
export interface ErrorHandleOptions {
  /** Whether to include the stack trace in the output */
  includeStack?: boolean;
  /** @deprecated Use ComposioError.handleAndThrow() instead. This option will be removed in a future version. */
  exitProcess?: boolean;
  /** @deprecated This option is no longer used. */
  exitCode?: number;
}

/**
 * Options for creating a ComposioError
 */
export type ComposioErrorOptions = {
  /** Error code for categorizing errors */
  code?: string;
  /** HTTP status code associated with the error */
  statusCode?: number;
  /** The underlying cause of the error */
  cause?: unknown;
  /** Additional metadata associated with the error */
  meta?: Record<string, unknown>;
  /** Suggested fixes for the error */
  possibleFixes?: string[];
  /** Custom stack trace */
  stack?: string;
};

/**
 * Structure containing the error data used for formatting
 * @private
 */
interface ErrorFormatData {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  cause?: string;
  meta?: Record<string, unknown>;
  possibleFixes?: string[];
  stack?: string[];
}

/**
 * Base error class for all Composio errors
 */
export class ComposioError extends Error {
  /** @readonly Error name */
  public name = 'ComposioError';
  public code?: string;
  public possibleFixes?: string[];
  public errorId?: string;

  /**
   * Creates a new ComposioError
   * @param message Error message
   * @param options Additional error options
   */
  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message);

    // Captures stack trace excluding the constructor frame first
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Process the status code - either from options or from the cause if it's a BadRequestError
    const statusCode =
      options.statusCode ||
      (options.cause instanceof BadRequestError ? options.cause.status : undefined);

    this.code = `TS-SDK::${options.code}`;
    // format the possible fixes
    this.possibleFixes = options.possibleFixes;

    // Only define properties that have values to avoid showing undefined in error display
    // Node.js by default shows all the properties of the error object, so we are doing it conditionally
    this.definePropertyIfExists('statusCode', statusCode);
    this.definePropertyIfExists('cause', options.cause);

    const combinedStack =
      options.cause instanceof Error
        ? ComposioError.combineStackTraces(options.cause.stack, this.stack)
        : (options.stack ?? this.stack);
    this.definePropertyIfExists('stack', combinedStack);

    if (options.meta && Object.keys(options.meta).length > 0) {
      this.definePropertyIfExists('meta', options.meta);
    }
  }

  /**
   * Helper method to define a property only if it has a value
   * @param propertyName Name of the property to define
   * @param value Value to assign to the property
   * @private
   */
  private definePropertyIfExists(propertyName: string, value: unknown): void {
    if (value !== undefined) {
      Object.defineProperty(this, propertyName, {
        value,
        enumerable: true,
        writable: false,
        configurable: true,
      });
    }
  }

  /**
   * Helper method to combine stack traces when wrapping errors
   * This ensures the full call chain is preserved
   * @param originalStack The stack of the error being wrapped
   * @param currentStack The stack of the wrapper error
   * @returns Combined stack trace
   * @private
   */
  private static combineStackTraces(
    originalStack?: string,
    currentStack?: string
  ): string | undefined {
    if (!originalStack) return currentStack;
    if (!currentStack) return originalStack;

    const currentHeader = currentStack.split('\n')[0];
    const originalStackBody = originalStack.split('\n').slice(1).join('\n');

    return `${currentHeader}\n${currentStack.split('\n').slice(1).join('\n')}\n\nCaused by:\n${originalStackBody}`;
  }

  /**
   * Extract and normalize error data for formatting
   * @param includeStack Whether to include stack trace information
   * @returns Structured error data for formatting
   * @private
   */
  private getErrorData(includeStack = false): ErrorFormatData {
    const data: ErrorFormatData = {
      name: this.name,
      message: this.message,
    };

    const { cause, code, stack, statusCode, meta, possibleFixes } = this as unknown as {
      cause: unknown;
      code: string | undefined;
      stack: string | undefined;
      statusCode: number | undefined;
      meta: Record<string, unknown> | undefined;
      possibleFixes: string[] | undefined;
    };

    // Format cause properly if it exists
    if (cause !== undefined) {
      const rawCause = cause;
      data.cause = rawCause instanceof Error ? rawCause.message : String(rawCause);
    }

    // Add code if exists
    if (code) {
      data.code = code;
    }

    // Add status code if exists
    if (statusCode !== undefined) {
      data.statusCode = statusCode;
    }

    // Add meta if exists
    if (meta) {
      data.meta = meta;
    }

    // Add possible fixes if exists
    if (possibleFixes) {
      data.possibleFixes = possibleFixes;
    }

    // Add stack trace if requested
    if (includeStack && stack) {
      if (stack.includes('Caused by:')) {
        const [currentStack, causeStack] = stack.split('Caused by:');
        data.stack = [
          ...currentStack.split('\n').slice(1),
          'Caused by:',
          ...causeStack.split('\n'),
        ];
      } else {
        data.stack = stack.split('\n').slice(1);
      }
    }

    return data;
  }

  /**
   * Prints a user-friendly, colorful representation of the error to the logger
   * @param includeStack Whether to include the stack trace in the output (default: false)
   */
  prettyPrint(includeStack = false): void {
    const data = this.getErrorData(includeStack);

    let output =
      '\n' + chalk.bgRed.white.bold(' ERROR ') + ' ' + chalk.white.bold(data.message) + '\n';

    if (data.code) {
      output += chalk.yellow(`Error Code: ${data.code}`) + '\n';
    }

    if (data.statusCode !== undefined) {
      output += chalk.yellow(`Status: ${data.statusCode}`) + '\n';
    }

    if (data.cause) {
      output += chalk.gray('Reason:') + '\n';
      output += '  ' + chalk.white(data.cause) + '\n';
    }

    if (data.meta) {
      output += chalk.gray('Additional Information:') + '\n';
      output +=
        '  ' + chalk.white(JSON.stringify(data.meta, null, 2).replace(/\n/g, '\n  ')) + '\n';
    }

    if (data.possibleFixes?.length) {
      output += '\n' + chalk.cyan.bold('Try the following:') + '\n';
      const fixes = data.possibleFixes?.map((fix, index) => ` ${index + 1}. ` + chalk.white(fix));
      output += fixes?.join('\n') + '\n';
    }

    if (data.stack?.length) {
      output += '\n' + chalk.gray('Stack Trace:') + '\n';
      output += chalk.gray(data.stack.join('\n')) + '\n';
    }

    output += '\n'; // Add a trailing empty line

    logger.error(output);
  }

  /**
   * Static factory method to create and pretty print an error in one step
   * @param message Error message
   * @param options Error options
   * @param includeStack Whether to include the stack trace in the output
   * @returns The created error instance
   */
  static createAndPrint(
    message: string,
    options: ComposioErrorOptions = {},
    includeStack = false
  ): ComposioError {
    const error = new ComposioError(message, options);
    error.prettyPrint(includeStack);
    return error;
  }

  /**
   * Utility function to handle errors in a consistent way
   * This properly displays the error without throwing
   * @param error The error to handle
   * @param options Options for error handling
   */
  static handle(error: unknown, options: ErrorHandleOptions = {}): void {
    const { includeStack = false, exitProcess = false } = options;

    if (error instanceof ComposioError) {
      // For Composio errors, use pretty printing
      error.prettyPrint(includeStack);
    } else if (error instanceof ZodError) {
      // For Zod errors, create a specialized formatted output
      this.handleZodError(error, includeStack);
    } else if (error instanceof Error) {
      // For standard errors, create a basic formatted output
      this.handleStandardError(error, includeStack);
    } else {
      // For unknown errors
      this.handleUnknownError(error);
    }

    // @deprecated - exitProcess is deprecated, use handleAndThrow() instead
    if (exitProcess) {
      this.throwError(error);
    }
  }

  /**
   * Utility function to handle errors and then throw them
   * This properly displays the error and then throws it, allowing callers to catch it.
   * Use this for fatal errors that should stop execution.
   * @param error The error to handle and throw
   * @param includeStack Whether to include the stack trace in the output
   * @throws ComposioError - Always throws after displaying the error
   */
  static handleAndThrow(error: unknown, includeStack = false): never {
    this.handle(error, { includeStack });
    this.throwError(error);
  }

  /**
   * Helper method to throw an error as a ComposioError
   * @param error The error to throw
   * @private
   */
  private static throwError(error: unknown): never {
    if (error instanceof ComposioError) {
      throw error;
    } else if (error instanceof Error) {
      throw new ComposioError(error.message, { cause: error });
    } else {
      throw new ComposioError(String(error));
    }
  }

  /**
   * Helper method to handle Zod validation errors
   * @param error The Zod error to handle
   * @param includeStack Whether to include the stack trace
   * @private
   */
  private static handleZodError(error: ZodError, includeStack: boolean): void {
    logger.error('\n' + chalk.bgRed.white.bold(' ERROR ') + ' ' + chalk.white.bold(error.message));

    // print the invalid parameters
    logger.error(chalk.gray('Invalid parameters:'));
    error.errors.forEach(err => {
      logger.error(chalk.yellow(err.path.join('.')) + ' ' + chalk.white(err.message));
    });

    logger.error(chalk.gray('Expected parameters:'));
    error.errors.forEach(err => {
      logger.error(chalk.yellow(err.path.join('.')) + ' ' + chalk.white(err.message));
    });

    if (includeStack) {
      logger.error('\n' + chalk.gray('Validation Errors:'));
      error.errors.forEach(err => {
        const path = err.path.join('.');
        logger.error(
          chalk.gray('  • ') + chalk.yellow(path ? `${path}: ` : '') + chalk.white(err.message)
        );
      });

      if (error.stack) {
        logger.error('\n' + chalk.gray('Stack Trace:'));
        const stackLines = error.stack.split('\n').slice(1);
        logger.error(chalk.gray(stackLines.join('\n')));
      }
    }

    logger.error(''); // Add a trailing empty line
  }

  /**
   * Helper method to handle standard Error objects
   * @param error The standard error to handle
   * @param includeStack Whether to include the stack trace
   * @private
   */
  private static handleStandardError(error: Error, includeStack: boolean): void {
    logger.error('\n' + chalk.bgRed.white.bold(' ERROR ') + ' ' + chalk.white.bold(error.message));

    if (includeStack && error.stack) {
      logger.error('\n' + chalk.gray('Stack Trace:'));
      const stackLines = error.stack.split('\n').slice(1);
      logger.error(chalk.gray(stackLines.join('\n')));
    }

    logger.error(''); // Add a trailing empty line
  }

  /**
   * Helper method to handle unknown error types
   * @param error The unknown error value
   * @private
   */
  private static handleUnknownError(error: unknown): void {
    logger.error(
      '\n' + chalk.bgRed.white.bold(' ERROR ') + ' ' + chalk.white.bold('Unknown error occurred')
    );

    if (error !== null && error !== undefined) {
      logger.error(chalk.gray('Error details:'));
      logger.error('  ' + chalk.white(String(error)));
    }

    logger.error(''); // Add a trailing empty line
  }
}
