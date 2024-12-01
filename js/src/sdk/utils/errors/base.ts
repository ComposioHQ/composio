
// Custom error class for Composio errors
export class ComposioError extends Error {
    _originalStack: string | undefined;
    timestamp: string;
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
        this.timestamp = new Date().toISOString();

        if(originalError){
          this._originalStack = `${originalError?.stack}`;
        }

        let detailedMessage = `Code: ${errCode}\nMessage: ${message}\n`;
        if (description) detailedMessage += `Debug Info: ${description}\n`;
        if (possibleFix) detailedMessage += `How to fix: ${possibleFix}\n`
    }
}