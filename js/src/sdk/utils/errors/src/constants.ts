
export  const SDK_ERROR_CODES = {
    BACKEND: {
        NOT_FOUND: "BACKEND::NOT_FOUND", 
        RATE_LIMIT: "BACKEND::RATE_LIMIT",
        BAD_REQUEST: "BACKEND::BAD_REQUEST",
        UNAUTHORIZED: "BACKEND::UNAUTHORIZED",
        SERVER_ERROR: "BACKEND::SERVER_ERROR",
        SERVER_UNAVAILABLE: "BACKEND::SERVER_UNAVAILABLE",
        UNKNOWN: "BACKEND::UNKNOWN",
    },
    COMMON: {
        API_KEY_UNAVAILABLE: "COMMON::API_KEY_INVALID",
        BASE_URL_NOT_REACHABLE: "COMMON::BASE_URL_NOT_REACHABLE",
        UNKNOWN: "COMMON::ERROR_CODE_NOT_DEFINED",
        SERVER_UNAVAILABLE: "COMMON::SERVER_UNAVAILABLE",
        REQUEST_TIMEOUT: "COMMON::REQUEST_TIMEOUT",
        REQUEST_ABORTED: "COMMON::REQUEST_ABORTED",
        INVALID_PARAMS_PASSED: "COMMON::INVALID_PARAMS_PASSED",   
    },
    SDK:{
        NO_CONNECTED_ACCOUNT_FOUND: "SDK::NO_CONNECTED_ACCOUNT_FOUND",
    }
}

export const BASE_ERROR_CODE_INFO = {
    [SDK_ERROR_CODES.BACKEND.NOT_FOUND]: {
        message: "🔍 API not found",
        description: "The requested resource is missing",
        possibleFix: "Verify the URL or resource identifier."
    },
    [SDK_ERROR_CODES.BACKEND.BAD_REQUEST]: {
        message: "🚫 Bad Request. The request was malformed or incorrect",
        description: null,
        possibleFix: "Please check your request format and parameters."
    },
    [SDK_ERROR_CODES.BACKEND.UNAUTHORIZED]: {
        message: "🔑 Access Denied",
        description: "You do not have the necessary credentials.",
        possibleFix: "Ensure your API key is correct and has the required permissions."
    },
    [SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT]: {
        message: "🕒 Request Timeout",
        description: "The request timed out while waiting for a response.",
        possibleFix: "Please try again later. If the issue persists, contact support."
    },
    [SDK_ERROR_CODES.BACKEND.SERVER_ERROR]: {
        message: "💥 Oops! Internal server error",
        description: "Your request could not be processed due to an internal server error.",
        possibleFix: "Please try again later. If the issue persists, contact support."
    },
    [SDK_ERROR_CODES.BACKEND.RATE_LIMIT]: {
        message: "⏱️ API Rate Limit Exceeded",
        description: "You have exceeded the rate limit for requests.",
        possibleFix: "Please wait a bit before trying your request again."
    },
    [SDK_ERROR_CODES.COMMON.API_KEY_UNAVAILABLE]: {
        message: "🔑 API Key Missing or Invalid",
        description: "The API key provided is missing or incorrect.",
        possibleFix: "Ensure that your API key is passed to client or set in COMPOSIO_API_KEY environment variable."
    },
    [SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE]: {
        message: "🚫 Server Unavailable",
        description: "The server is currently unable to handle the request.",
        possibleFix: "Please try again later. If the issue persists, contact support."
    },
    [SDK_ERROR_CODES.COMMON.BASE_URL_NOT_REACHABLE]: {
        message: "🔗 Base URL is not valid",
        description: "The base URL provided is not valid.",
        possibleFix: "Ensure that the base URL is correct and accessible."
    },
    [SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED]: {
        message: "🕒 Invalid parameters passed",
        description: "The parameters passed are invalid",
        possibleFix: "Please check the metadata.issues for more details"
    },
    UNKNOWN: {
        message: null,
        description: null,
        possibleFix: "Contact our support team with the error details for further assistance."
    },
    [SDK_ERROR_CODES.BACKEND.UNKNOWN]: {
        message: null,
        description: null,
        possibleFix: "Contact our support team with the error details for further assistance."
    }
}


export const BE_STATUS_CODE_TO_SDK_ERROR_CODES = {
    400: SDK_ERROR_CODES.BACKEND.BAD_REQUEST,
    401: SDK_ERROR_CODES.BACKEND.UNAUTHORIZED,
    404: SDK_ERROR_CODES.BACKEND.NOT_FOUND,
    408: SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT,
    429: SDK_ERROR_CODES.BACKEND.RATE_LIMIT,
    500: SDK_ERROR_CODES.BACKEND.SERVER_ERROR,
    502: SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE,

} as Record<number, string>;

