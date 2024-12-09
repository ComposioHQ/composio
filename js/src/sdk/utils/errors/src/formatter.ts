import { ComposioError } from "./composioError";
import { SDK_ERROR_CODES, BASE_ERROR_CODE_INFO, BE_STATUS_CODE_TO_SDK_ERROR_CODES } from "./constants";
import { AxiosError } from "axios";

interface ErrorResponse {
    errorKey: string;
    message: string;
    description: string;
    possibleFix: string;
    metadata?: Record<string, any>;
}

interface ErrorDetails {
    message: string;
    description: string;
    possibleFix: string;
    metadata?: Record<string, any>;
}


export const getAPIErrorDetails = (errorKey: string, axiosError: any, predefinedError: any): ErrorDetails => {
    const defaultErrorDetails = {
        message: axiosError.message,
        description: axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message,
        possibleFix: "Please check the network connection, request parameters, and ensure the API endpoint is correct."
    };

    const metadata = generateMetadataFromAxiosError(axiosError);
    switch (errorKey) {
        case SDK_ERROR_CODES.BACKEND.NOT_FOUND:
        case SDK_ERROR_CODES.BACKEND.UNAUTHORIZED:
        case SDK_ERROR_CODES.BACKEND.SERVER_ERROR:
        case SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE:
        case SDK_ERROR_CODES.BACKEND.RATE_LIMIT:
            return {
                message: `${predefinedError.message || axiosError.message} for ${axiosError.config.baseURL + axiosError.config.url}`,
                description: axiosError.response?.data?.message || predefinedError.description,
                possibleFix: predefinedError.possibleFix || defaultErrorDetails.possibleFix,
                metadata
            };

        case SDK_ERROR_CODES.BACKEND.BAD_REQUEST:
            const validationErrors = axiosError.response?.data?.errors; 
            const formattedErrors = Array.isArray(validationErrors)
                ? validationErrors.map(err => JSON.stringify(err)).join(", ")
                : JSON.stringify(validationErrors);

            return {
                message: `Validation Errors while making request to ${axiosError.config.baseURL + axiosError.config.url}`,
                description: `Validation Errors: ${formattedErrors}`,
                possibleFix: "Please check the request parameters and ensure they are correct.",
                metadata
            };

        case SDK_ERROR_CODES.BACKEND.UNKNOWN:
        case SDK_ERROR_CODES.COMMON.UNKNOWN:
            return {
                message: `${axiosError.message} for ${axiosError.config.baseURL + axiosError.config.url}`,
                description: axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message,
                possibleFix: "Please contact tech@composio.dev with the error details.",
                metadata
            };

        default:
            return {
                message: `${predefinedError.message || axiosError.message} for ${axiosError.config.baseURL + axiosError.config.url}`,
                description: axiosError.response?.data?.message || predefinedError.description,
                possibleFix: predefinedError.possibleFix || defaultErrorDetails.possibleFix,
                metadata
            };
    }
};


export const generateMetadataFromAxiosError = (axiosError: any): Record<string, any> => {
    const requestId = axiosError.response?.headers["x-request-id"];
    return {
        fullUrl: axiosError.config.baseURL + axiosError.config.url,
        method: axiosError.config.method.toUpperCase(),
        statusCode: axiosError.response?.status,
        requestId: requestId ? `Request ID: ${requestId}` : undefined,
        metadata: axiosError.metadata,
    }
}


