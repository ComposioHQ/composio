export  const ERROR = {
    BACKEND: {
        NOT_FOUND: "BACKEND::NOT_FOUND", 
        RATE_LIMIT: "BACKEND::RATE_LIMIT",
        BAD_REQUEST: "BACKEND::BAD_REQUEST",
        UNAUTHORIZED: "BACKEND::UNAUTHORIZED",
        SERVER_ERROR: "BACKEND::SERVER_ERROR",
        SERVER_UNAVAILABLE: "BACKEND::SERVER_UNAVAILABLE",
        UNKNOWN: "BACKEND::UNKNOWN"
    },
    COMMON: {
        API_KEY_UNAVAILABLE: "COMMON::API_KEY_INVALID",
        BASE_URL_INVALID: "COMMON::BASE_URL_INVALID",
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
        message: "🚫 Bad Request. The request was malformed or incorrect.",
        description: null,
        possibleFix: "Please check your request format and parameters."
    },
    [ERROR.BACKEND.UNAUTHORIZED]: {
        message: "🔑 Access Denied.",
        description: "You do not have the necessary credentials.",
        possibleFix: "Ensure your API key is correct and has the required permissions."
    },
    [ERROR.BACKEND.SERVER_ERROR]: {
        message: "💥 Oops! Something went wrong on our end.",
        description: null,
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
        possibleFix: "Ensure that your API key is passed to client or set in COMPOSIO_API_KEY environment variable."
    },
    [ERROR.BACKEND.SERVER_UNAVAILABLE]: {
        message: "🚫 Server Unavailable.",
        description: "The server is currently unable to handle the request.",
        possibleFix: "Please try again later. If the issue persists, contact support."
    },
    [ERROR.COMMON.BASE_URL_INVALID]: {
        message: "🔗 Base URL is not valid.",
        description: "The base URL provided is not valid.",
        possibleFix: "Ensure that the base URL is correct and accessible."
    },
    UNKNOWN: {
        message: null,
        description: null,
        possibleFix: "Contact our support team with the error details for further assistance."
    },
    [ERROR.BACKEND.UNKNOWN]: {
        message: null,
        description: null,
        possibleFix: "Contact our support team with the error details for further assistance."
    }
}

export const statusCodeToErrorMap = {
    400: ERROR.BACKEND.BAD_REQUEST,
    401: ERROR.BACKEND.UNAUTHORIZED,
    404: ERROR.BACKEND.NOT_FOUND,
    429: ERROR.BACKEND.RATE_LIMIT,
    500: ERROR.BACKEND.SERVER_ERROR,
    502: ERROR.BACKEND.SERVER_UNAVAILABLE
} as Record<number, string>;

