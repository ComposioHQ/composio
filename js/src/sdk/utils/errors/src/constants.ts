export const COMPOSIO_SDK_ERROR_CODES = {
  BACKEND: {
    NOT_FOUND: "BACKEND::NOT_FOUND",
    RATE_LIMIT: "BACKEND::RATE_LIMIT",
    BAD_REQUEST: "BACKEND::BAD_REQUEST",
    UNAUTHORIZED: "BACKEND::UNAUTHORIZED",
    SERVER_ERROR: "BACKEND::SERVER_ERROR",
    SERVER_UNAVAILABLE: "BACKEND::SERVER_UNAVAILABLE",
    SERVER_UNREACHABLE: "BACKEND::SERVER_UNREACHABLE",
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
  SDK: {
    NO_CONNECTED_ACCOUNT_FOUND: "SDK::NO_CONNECTED_ACCOUNT_FOUND",
    FAILED_TO_INITIATE_CONNECTION: "SDK::FAILED_TO_INITIATE_CONNECTION",
    INVALID_PARAMETER: "SDK::INVALID_PARAMETER",
  },
};

export const BASE_ERROR_CODE_INFO = {
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND]: {
    message: "🔍 API not found",
    description: "The requested resource is missing",
    possibleFix:
      "Ensure the resource id or resource identifier is correct and valid as backend returned 404",
  },
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.BAD_REQUEST]: {
    message: "🚫 Bad Request. The request was malformed or incorrect",
    description: null,
    possibleFix:
      "Check your parameters and request format, as the backend returned a 400 error.",
  },
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.UNAUTHORIZED]: {
    message: "🔑 Access Denied",
    description: "You do not have the necessary credentials.",
    possibleFix:
      "Ensure your API key is correct and has the required permissions.",
  },
  [COMPOSIO_SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT]: {
    message: "🕒 Request Timeout",
    description: "The request timed out while waiting for a response.",
    possibleFix:
      "Please try again later. If the issue persists, contact support or check your network connection.",
  },
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_ERROR]: {
    message: "💥 Oops! Internal server error",
    description:
      "Your request could not be processed due to an internal server error.",
    possibleFix:
      "Please try again later. If the issue persists, contact support.",
  },
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.RATE_LIMIT]: {
    message: "⏱️ API Rate Limit Exceeded",
    description: "You have exceeded the rate limit for requests.",
    possibleFix: "Please wait a bit before trying your request again.",
  },
  [COMPOSIO_SDK_ERROR_CODES.COMMON.API_KEY_UNAVAILABLE]: {
    message: "🔑 API Key Missing or Invalid",
    description: "The API key provided is missing or incorrect.",
    possibleFix:
      "Ensure that your API key is passed to client or set in COMPOSIO_API_KEY environment variable.",
  },
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE]: {
    message: "🚫 Server Unavailable",
    description: "The server is currently unable to handle the request.",
    possibleFix:
      "Please try again later. If the issue persists, contact support.",
  },
  [COMPOSIO_SDK_ERROR_CODES.COMMON.BASE_URL_NOT_REACHABLE]: {
    message: "🔗 Base URL is not valid",
    description: "The base URL provided is not valid.",
    possibleFix: "Ensure that the base URL is correct and accessible.",
  },
  [COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED]: {
    message: "🕒 Invalid parameters passed",
    description: "The parameters passed are invalid",
    possibleFix: "Please check the error message for more details",
  },
  UNKNOWN: {
    message: null,
    description: null,
    possibleFix:
      "Contact our support team with the error details for further assistance.",
  },
  [COMPOSIO_SDK_ERROR_CODES.BACKEND.UNKNOWN]: {
    message: null,
    description: null,
    possibleFix:
      "Contact our support team with the error details for further assistance.",
  },
};

export const API_TO_SDK_ERROR_CODE = {
  400: COMPOSIO_SDK_ERROR_CODES.BACKEND.BAD_REQUEST,
  401: COMPOSIO_SDK_ERROR_CODES.BACKEND.UNAUTHORIZED,
  404: COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND,
  408: COMPOSIO_SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT,
  429: COMPOSIO_SDK_ERROR_CODES.BACKEND.RATE_LIMIT,
  500: COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_ERROR,
  502: COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE,
} as Record<number, string>;
