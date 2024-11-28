import { ERROR, PREDEFINED_ERROR_REGISTRY, statusCodeToErrorMap } from "./constants";

export const getBackendErrorResponseFormat = (axiosError: any): {
    errorKey: string;
    message: string;
    description: string;
    possibleFix: string;
} => {
    const status_code = axiosError.response?.status;
    const errorKey = statusCodeToErrorMap[status_code] || ERROR.BACKEND.UNKNOWN;

    // Get predefined error details if available
    const predefinedError = PREDEFINED_ERROR_REGISTRY[errorKey];

    // Default error details as fallback
    const defaultErrorDetails = {
        message: axiosError.message,
        description: axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message,
        possibleFix: "Please check the network connection, request parameters, and ensure the API endpoint is correct."
    };

    let errorDetails: {
        message: string;
        description: string;
        possibleFix: string;
    };

    switch (errorKey) {
        case ERROR.BACKEND.NOT_FOUND:
        case ERROR.BACKEND.UNAUTHORIZED:
        case ERROR.BACKEND.SERVER_ERROR:
        case ERROR.BACKEND.SERVER_UNAVAILABLE:
        case ERROR.BACKEND.RATE_LIMIT:
            errorDetails = {
                message: predefinedError.message || axiosError.message,
                description: axiosError.response?.data?.message || predefinedError.description,
                possibleFix: predefinedError.possibleFix || defaultErrorDetails.possibleFix
            };
            break;

        case ERROR.BACKEND.BAD_REQUEST:
            const validationErrors = axiosError.response?.data;
            const formattedErrors = Array.isArray(validationErrors)
                ? validationErrors.map(err => JSON.stringify(err)).join(", ")
                : JSON.stringify(validationErrors);

            errorDetails = {
                message: "Validation Errors",
                description: `Validation Errors: ${formattedErrors}`,
                possibleFix: "Please check the request parameters and ensure they are correct."
            };
            break;

        case ERROR.BACKEND.UNKNOWN:
        case ERROR.COMMON.UNKNOWN:
            errorDetails = {
                message: axiosError.message,
                description: axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message,
                possibleFix: "Please contact tech@composio.dev with the error details."
            };
            break;

        default:
            errorDetails = {
                message: predefinedError.message || axiosError.message,
                description: axiosError.response?.data?.message || predefinedError.description,
                possibleFix: predefinedError.possibleFix || defaultErrorDetails.possibleFix
            };
    }

    const finalDescription = `Got ${status_code} response from URL🔗: ${axiosError.config.url}, des: ${errorDetails.description}`;
    errorDetails.description = `${finalDescription}, message: ${errorDetails.message}`;

    return {
        errorKey,
        ...errorDetails
    };
}