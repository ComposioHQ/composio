// Helper function to stringify objects if needed
export const ifObjectStringify = (obj: any) => {
    return typeof obj === 'object' ? JSON.stringify(obj) : obj;
}

// Custom error class for Composio errors
export class ComposioError extends Error {
    constructor(
        public errCode: string, 
        public message: string, 
        public description?: string, 
        public possibleFix?: string,
        originalError?: any
    ) {
        super(message);
        this.name = 'ComposioError';
        this.errCode = errCode;
        this.description = description;
        this.possibleFix = possibleFix;

        let detailedMessage = `Code: ${errCode}\nMessage: ${message}\n`;
        if (description) detailedMessage += `Debug Info: ${description}\n`;
        if (possibleFix) detailedMessage += `How to fix: ${possibleFix}\n`;

        // Hide internal properties from enumeration
        Object.defineProperty(this, 'errCode', { enumerable: false });
        Object.defineProperty(this, 'message', { enumerable: false });
        Object.defineProperty(this, 'description', { enumerable: false });
        Object.defineProperty(this, 'possibleFix', { enumerable: false });


        // Log error details in a structured format for better debugging
        console.error('\n===== Composio Error =====');
        console.table({
            'Error Code': this.errCode,
            'Message': this.message,
            'Description': this.description || 'No additional details provided',
            'Possible Fix': this.possibleFix || 'No fix suggestion available',
            'Timestamp': new Date().toISOString(),
        });

        if(originalError){
            this.stack = `${originalError?.stack}`;
        }
    }
}