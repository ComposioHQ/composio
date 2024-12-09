import { v4 as uuidv4 } from 'uuid';
import { getLogLevel } from '../../../../utils/logger';
import { logError } from '..';

/**
 * Custom error class for Composio that provides rich error details, tracking, and improved debugging
 */
export class ComposioError extends Error {
    // time at which the error occurred
    public readonly timestamp: string;

    // unique identifier for the error
    private readonly errorId: string;

    // error code
    private readonly errCode: string;

    // additional metadata about the error
    private readonly metadata?: Record<string, any> = {};

    // description of the error
    private readonly description?: string;

    // possible fix for the error
    private readonly possibleFix?: string;

    // original error object
    private readonly _originalError?: any;

    constructor(
        errCode: string,
        message: string,
        description?: string,
        possibleFix?: string,
        metadata?: Record<string, any>,
        originalError?: any,
    ) {
        // Ensure message is never empty
        super(message || 'An unknown error occurred');

        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);

        this.name = 'ComposioError';
        this.errCode = errCode;
        this.description = description;
        this.possibleFix = possibleFix;
        this.timestamp = new Date().toISOString();
        this.metadata = metadata;
        this.errorId = uuidv4();

        let originalErrorString: string = '';

        // Only print original error if COMPOSIO_LOGGING_LEVEL is debug
        if (originalError) {
            try {
                originalErrorString = typeof originalError === 'object'
                    ? JSON.parse(JSON.stringify(originalError))
                    : originalError;
            } catch (e) {
                originalErrorString = String(originalError);
            }

            if (getLogLevel() === 'debug') {
                this._originalError = originalErrorString;
            }
        }

        logError({
            error_id: this.errorId,
            error_code: this.errCode,
            original_error: originalErrorString,
            description: this.description || '',
            metadata: this.metadata || {},
            message: this.message,
            possible_fix: this.possibleFix || '',
            current_stack: this.stack?.split('\n') || []
        });

        
        // Capture stack trace, excluding constructor call
        Error.captureStackTrace(this, this.constructor);
    }

    get originalError(): any {
        return this._originalError;
    }


    /**
     * Returns a complete object representation for logging/serialization
     * Includes all error details and metadata
     */
    toJSON(): Record<string, any> {
        const errorObj = {
            name: this.name,
            errorId: this.errorId,
            code: this.errCode,
            message: this.message,
            description: this.description,
            possibleFix: this.possibleFix,
            timestamp: this.timestamp,
            stack: this.stack?.split('\n'),
            originalStack: this.originalError?.stack?.split('\n'),
        };

        // Remove undefined/null properties
        return Object.entries(errorObj).reduce((acc, [key, value]) => {
            if (value !== undefined && value !== null) {
                acc[key] = value;
            }
            return acc;
        }, {} as Record<string, any>);
    }
}