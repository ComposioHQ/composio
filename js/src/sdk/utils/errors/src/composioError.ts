import { logError } from "..";
import { getUUID } from "../../../../utils/common";
import logger, { getLogLevel, LOG_LEVELS } from "../../../../utils/logger";

/**
 * Custom error class for Composio that provides rich error details, tracking, and improved debugging
 */
export class ComposioError extends Error {
  // time at which the error occurred
  readonly timestamp: string;

  // unique identifier for the error
  readonly errorId: string;

  // error code
  readonly errCode: string;

  // additional metadata about the error
  readonly metadata?: Record<string, unknown> = {};

  // description of the error
  readonly description?: string;

  // possible fix for the error
  readonly possibleFix?: string;

  // original error object
  readonly _originalError?: unknown;

  constructor(
    errCode: string,
    message: string,
    description?: string,
    possibleFix?: string,
    metadata?: Record<string, unknown>,
    originalError?: unknown
  ) {
    // Ensure message is never empty
    super(message || "An unknown error occurred");

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = "ComposioError";
    this.errCode = errCode;
    this.description = description;
    this.possibleFix = possibleFix;
    this.timestamp = new Date().toISOString();
    this.metadata = metadata;
    this.errorId = getUUID();

    let originalErrorString: string = "";

    // Only print original error if COMPOSIO_LOGGING_LEVEL is debug
    if (originalError) {
      try {
        originalErrorString =
          typeof originalError === "object"
            ? JSON.parse(JSON.stringify(originalError))
            : originalError;
      } catch (_e) {
        originalErrorString = String(originalError);
      }

      if (getLogLevel() === "debug") {
        this._originalError = originalErrorString;
      }
    }

    // Only in case of info or debug, we will log the error
    if (LOG_LEVELS[getLogLevel()] >= 2) {
      logger.info(
        `🚀 [Info] Give Feedback / Get Help: https://dub.composio.dev/discord `
      );

      logger.info(
        `🐛 [Info] Create a new issue: https://github.com/ComposioHQ/composio/issues `
      );
      if (getLogLevel() !== "debug") {
        logger.info(
          `⛔ [Info] If you need to debug this error, set env variable COMPOSIO_LOGGING_LEVEL=debug`
        );
      }
    }

    logError({
      error_id: this.errorId,
      error_code: this.errCode,
      original_error: originalErrorString,
      description: this.description || "",
      metadata: this.metadata || {},
      message: this.message,
      possible_fix: this.possibleFix || "",
      current_stack: this.stack?.split("\n") || [],
    });

    // Capture stack trace, excluding constructor call
    Error.captureStackTrace(this, this.constructor);
  }

  get originalError() {
    return this._originalError;
  }

  /**
   * Returns a complete object representation for logging/serialization
   * Includes all error details and metadata
   */
  toJSON(): Record<string, unknown> {
    const errorObj = {
      name: this.name,
      errorId: this.errorId,
      code: this.errCode,
      message: this.message,
      description: this.description,
      possibleFix: this.possibleFix,
      timestamp: this.timestamp,
      stack: this.stack?.split("\n"),
      originalStack: (this.originalError as Error)?.stack?.split("\n"),
    };

    // Remove undefined/null properties
    return Object.entries(errorObj).reduce(
      (acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>
    );
  }
}
