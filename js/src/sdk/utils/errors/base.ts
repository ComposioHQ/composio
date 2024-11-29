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
        // @ts-ignore
        this.timestamp = new Date().toISOString();

        let detailedMessage = `Code: ${errCode}\nMessage: ${message}\n`;
        if (description) detailedMessage += `Debug Info: ${description}\n`;
        if (possibleFix) detailedMessage += `How to fix: ${possibleFix}\n`;

        if(originalError){
           this.stack = `${originalError?.stack}`;
        }

    }
}