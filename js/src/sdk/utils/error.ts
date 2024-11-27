
export const ERROR = {
    BACKEND: {
        NOT_FOUND: "BACKEND::NOT_FOUND", 
        RATE_LIMIT: "BACKEND::RATE_LIMIT",
        BAD_REQUEST: "BACKEND::BAD_REQUEST",
        UNAUTHORIZED: "BACKEND::UNAUTHORIZED",
        SERVER_ERROR: "BACKEND::SERVER_ERROR",
        UNKNOWN: "BACKEND::UNKNOWN"
    },
    COMMON: {
        API_KEY_UNAVAILABLE: "COMMON::API_KEY_INVALID",
        UNKNOWN: "SDK::UNKNOWN"
    }
}

export const PREDEFINED_ERROR_REGISTRY = {
    [ERROR.BACKEND.NOT_FOUND]: {
        message: "🔍 We searched everywhere but couldn't find what you're looking for.",
        description: "The requested resource is missing.",
        possibleFix: "Verify the URL or resource identifier."
    },
    [ERROR.BACKEND.BAD_REQUEST]: {
        message: "🚫 That didn't work as expected.",
        description: "Your request was malformed or incorrect.",
        possibleFix: "Please check your request format and parameters."
    },
    [ERROR.BACKEND.UNAUTHORIZED]: {
        message: "🔑 Access Denied.",
        description: "You do not have the necessary credentials.",
        possibleFix: "Ensure your API key is correct and has the required permissions."
    },
    [ERROR.BACKEND.SERVER_ERROR]: {
        message: "💥 Oops! Something went wrong on our end.",
        description: "An unexpected error occurred on the server.",
        possibleFix: "Please try again later. If the issue persists, contact support."
    },
    [ERROR.BACKEND.RATE_LIMIT]: {
        message: "⏱️ Slow down! You're moving too fast.",
        description: "You have exceeded the rate limit for requests.",
        possibleFix: "Please wait a bit before trying your request again."
    },
    [ERROR.COMMON.API_KEY_UNAVAILABLE]: {
        message: "🔑 API Key Missing or Invalid.",
        description: "The API key provided is missing or incorrect.",
        possibleFix: "Ensure that your API key is passed to Client or set in your environment variables."
    },
    UNKNOWN: {
        message: "❓ An unknown error occurred.",
        description: "The error is not recognized by our system.",
        possibleFix: "Contact our support team with the error details for further assistance."
    },
    [ERROR.BACKEND.UNKNOWN]: {
        message: "❓ An unknown error occurred.",
        description: "The error is not recognized by our system.",
        possibleFix: "Contact our support team with the error details for further assistance."
    }
}
class ComposioError extends Error {
    constructor(public errCode: string, public message: string, public description?: string, public possibleFix?: string,originalError?:any) {
        super(message);
        this.name = 'ComposioError';
        this.errCode = errCode;
        this.description = description;
        this.possibleFix = possibleFix;

        let detailedMessage = `Error Code: ${errCode}\nMessage: ${message}\n`;
        let detailedDescription = description;
     
        if (description) detailedMessage += `Description: ${description}\n`;
        if (possibleFix) detailedMessage += `Suggested Fix: ${possibleFix}\n`;

        Object.defineProperty(this, 'errCode', { enumerable: false });
        Object.defineProperty(this, 'message', { enumerable: false });
        Object.defineProperty(this, 'description', { enumerable: false });
        Object.defineProperty(this, 'possibleFix', { enumerable: false });


        this.stack = `${this.name}: ${detailedMessage}Stack Trace:\n${(new Error()).stack}`;
    }
}


// Composio Error Generator
export class CEG {
    static handleError(axiosError: any,) {
         let errorDetails = PREDEFINED_ERROR_REGISTRY.UNKNOWN;

        let errorKey = ERROR.COMMON.UNKNOWN;
        
        if (axiosError.response) {
            const { status } = axiosError.response;
        
            switch (status) {
                case 400:
                    errorKey = ERROR.BACKEND.BAD_REQUEST;
                    break;
                case 404:
                    errorKey = ERROR.BACKEND.NOT_FOUND;
                    break;
                case 429:
                    errorKey = ERROR.BACKEND.RATE_LIMIT;
                    break;
                case 401:
                    errorKey = ERROR.COMMON.API_KEY_UNAVAILABLE;
                    break;
                case 500:
                    errorKey = ERROR.BACKEND.SERVER_ERROR;
                    break;
                default:
                    errorKey = ERROR.BACKEND.UNKNOWN;
                    break;
            }
            if (errorKey !== ERROR.BACKEND.UNKNOWN) {
                errorDetails = PREDEFINED_ERROR_REGISTRY[errorKey];
            }else{
                errorDetails = {
                    message: axiosError.message,
                    description: axiosError.response.data.message || axiosError.response.data.error || axiosError.message,
                    possibleFix: "Please check the network connection, request parameters, and ensure the API endpoint is correct."
                }
            }
        }


        let axiosDataMessage = axiosError.response?.data?.message || axiosError.message;
        const status = axiosError.response?.status || axiosError.status || axiosError.code || 'unknown';
        const request_id = axiosError.response?.headers?.["x-request-id"];
        const urlAndStatus = axiosError.config?.url ? ` got 📊 ${status} response from URL🔗: ${axiosError.config.url}, request_id: ${request_id}` : '';

        axiosDataMessage = `❌ ${ifObjectStringify(axiosDataMessage) || errorDetails.description || "No additional information available."} ${urlAndStatus}`;
        throw new ComposioError(
            errorKey as string,
            errorDetails.message,
            axiosDataMessage || errorDetails.description  || "No additional information available.",
            errorDetails.possibleFix || "Please check the network connection and the request parameters.",
            axiosError
        );
    }

    static throwCustomError(messageCode: string, {
        message,
        type,
        subtype,
        description,
        possibleFix 
    }: {

        type?: string;
        subtype?: string;
        message?: string;
        description?: string;
        possibleFix?: string;
    }): never {
    
        const finalErrorCode = !!messageCode ? messageCode : `${type}::${subtype}`;

        const errorDetails = PREDEFINED_ERROR_REGISTRY[finalErrorCode] || PREDEFINED_ERROR_REGISTRY.UNKNOWN;
      
        throw new ComposioError(messageCode,  message || errorDetails.message, description || errorDetails.description, possibleFix || errorDetails.possibleFix);
    }
}

export const ifObjectStringify = (obj: any) => {
    return typeof obj === 'object' ? JSON.stringify(obj) : obj;
}