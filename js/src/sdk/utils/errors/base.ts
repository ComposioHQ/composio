import { v4 as uuidv4 } from 'uuid';
import { getLogLevel } from '../../../utils/logger';

/**
 * Custom error class for Composio that provides rich error details, tracking, and improved debugging
 */
export class ComposioError extends Error {
    private readonly timestamp: string;
    private readonly errorId: string;
    private readonly errCode: string;
    private readonly description?: string;
    private readonly possibleFix?: string;
    private readonly _originalError?: any;

    constructor(
        errCode: string,
        message: string,
        description?: string,
        possibleFix?: string,
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
        this.errorId = uuidv4();

        // Safely store original error info
        if (originalError) {
            let originalErrorString: string;
            try {
                originalErrorString = typeof originalError === 'object' ? 
                    JSON.parse(JSON.stringify(originalError)) : 
                    originalError;
            } catch (e) {
                originalErrorString = String(originalError);
            }

            if (getLogLevel() === 'debug') {
                this._originalError = originalErrorString;
            }
        }

        // Capture stack trace, excluding constructor call
        Error.captureStackTrace(this, this.constructor);
    }

 
 
    get originalError(): any { return this._originalError; }

    /**
     * Returns a formatted string representation of the error with all relevant details
     */
    toString(): string {
        const parts = [
            `ComposioError [${this.errorId}]`,
            `Code: ${this.errCode}`,
            `Message: ${this.message}`
        ];

        if (this.description) parts.push(`Description: ${this.description}`);
        if (this.possibleFix) parts.push(`Possible Fix: ${this.possibleFix}`);
        
        parts.push(`Time: ${this.timestamp}`);

        return parts.join('\n    ');
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
            originalStack: this.originalError?.stack?.split('\n')
        };

        // Remove undefined/null properties
        return Object.entries(errorObj)
            .reduce((acc, [key, value]) => {
                if (value !== undefined && value !== null) {
                    acc[key] = value;
                }
                return acc;
            }, {} as Record<string, any>);
    }
}