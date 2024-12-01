import { SDK_ERROR_CODES, BASE_ERROR_CODE_INFO, BE_STATUS_CODE_TO_SDK_ERROR_CODES } from "./constants";

interface ErrorResponse {
    errorKey: string;
    message: string;
    description: string;
    possibleFix: string;
}

interface ErrorDetails {
    message: string;
    description: string;
    possibleFix: string;
}

export const getBackendErrorResponseFormat = (axiosError: any): ErrorResponse => {
    const statusCode = axiosError.response?.status;
    const errorKey = BE_STATUS_CODE_TO_SDK_ERROR_CODES[statusCode] || SDK_ERROR_CODES.BACKEND.UNKNOWN;
    const predefinedError = BASE_ERROR_CODE_INFO[errorKey];

    const errorDetails = generateBaseErrorInfo(errorKey, axiosError, predefinedError);
    enrichWithReDetails(errorDetails, axiosError);

    return {
        errorKey,
        ...errorDetails
    };
};

const generateBaseErrorInfo = (errorKey: string, axiosError: any, predefinedError: any): ErrorDetails => {
    const defaultErrorDetails = {
        message: axiosError.message,
        description: axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message,
        possibleFix: "Please check the network connection, request parameters, and ensure the API endpoint is correct."
    };

    switch (errorKey) {
        case SDK_ERROR_CODES.BACKEND.NOT_FOUND:
        case SDK_ERROR_CODES.BACKEND.UNAUTHORIZED:
        case SDK_ERROR_CODES.BACKEND.SERVER_ERROR:
        case SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE:
        case SDK_ERROR_CODES.BACKEND.RATE_LIMIT:
            return {
                message: predefinedError.message || axiosError.message,
                description: axiosError.response?.data?.message || predefinedError.description,
                possibleFix: predefinedError.possibleFix || defaultErrorDetails.possibleFix
            };

        case SDK_ERROR_CODES.BACKEND.BAD_REQUEST:
            const validationErrors = axiosError.response?.data;
            const formattedErrors = Array.isArray(validationErrors)
                ? validationErrors.map(err => JSON.stringify(err)).join(", ")
                : JSON.stringify(validationErrors);

            return {
                message: "Validation Errors",
                description: `Validation Errors: ${formattedErrors}`,
                possibleFix: "Please check the request parameters and ensure they are correct."
            };

        case SDK_ERROR_CODES.BACKEND.UNKNOWN:
        case SDK_ERROR_CODES.COMMON.UNKNOWN:
            return {
                message: axiosError.message,
                description: axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message,
                possibleFix: "Please contact tech@composio.dev with the error details."
            };

        default:
            return {
                message: predefinedError.message || axiosError.message,
                description: axiosError.response?.data?.message || predefinedError.description,
                possibleFix: predefinedError.possibleFix || defaultErrorDetails.possibleFix
            };
    }
};

const enrichWithReDetails = (errorDetails: ErrorDetails, axiosError: any): void => {
    const requestId = axiosError.response?.headers["x-request-id"];
    const requestInfo = {
        url: axiosError.config.url,
        method: axiosError.config.method.toUpperCase(),
        requestId: requestId ? `Request ID: ${requestId}` : undefined,
        message: errorDetails.message,
        description: errorDetails.description
    };

    errorDetails.description = `${errorDetails.description}\n\nRequest Details:\n${JSON.stringify(requestInfo, null, 2)}`;
};