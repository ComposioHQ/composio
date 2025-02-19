import { AxiosError } from "axios";
import {
  API_TO_SDK_ERROR_CODE,
  BASE_ERROR_CODE_INFO,
  COMPOSIO_SDK_ERROR_CODES,
} from "./constants";

export interface ErrorResponseData {
  type: string;
  name: string;
  message: string;
  details?: Record<string, unknown>[] | Record<string, unknown>;
}

interface ErrorDetails {
  message: string;
  description: string;
  possibleFix: string;
  metadata?: Record<string, unknown>;
}

export const getAPIErrorDetails = (
  axiosError: AxiosError<ErrorResponseData>
): ErrorDetails => {
  const statusCode = axiosError.response?.status;
  const errorCode = statusCode
    ? API_TO_SDK_ERROR_CODE[statusCode]
    : COMPOSIO_SDK_ERROR_CODES.BACKEND.UNKNOWN;
  const predefinedError = BASE_ERROR_CODE_INFO[errorCode];

  const defaultErrorDetails = {
    message: axiosError.message,
    description: axiosError?.response?.data?.message || axiosError.message,
    possibleFix: "Please check the parameters you are passing to the API",
  };

  const metadata = generateMetadataFromAxiosError(axiosError);

  const errorNameFromBE = axiosError?.response?.data?.name;
  const errorTypeFromBE = axiosError?.response?.data?.type;
  const errorMessage = axiosError?.response?.data?.message;

  let genericMessage = "";

  const hasNotReceivedResponseFromBE =
    errorCode === COMPOSIO_SDK_ERROR_CODES.BACKEND.UNAUTHORIZED ||
    errorCode === COMPOSIO_SDK_ERROR_CODES.BACKEND.RATE_LIMIT ||
    errorCode === COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE ||
    errorCode === COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNREACHABLE;
  if (hasNotReceivedResponseFromBE) {
    genericMessage = predefinedError.message as string;
  } else if (axiosError.config?.baseURL && axiosError.config?.url) {
    genericMessage = `${errorNameFromBE || predefinedError.message} ${errorTypeFromBE ? `- ${errorTypeFromBE}` : ""} on ${axiosError.config?.baseURL! + axiosError.config?.url!}`;
  }

  switch (errorCode) {
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.BAD_REQUEST:
      const validationErrors = axiosError.response?.data?.details;
      const formattedErrors = Array.isArray(validationErrors)
        ? validationErrors.map((err) => JSON.stringify(err)).join(", ")
        : JSON.stringify(validationErrors);

      return {
        message: genericMessage,
        description: `Validation Errors: ${formattedErrors}`,
        possibleFix:
          "Please check the request parameters and ensure they are correct.",
        metadata,
      };
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND:
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.UNAUTHORIZED:
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_ERROR:
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE:
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.RATE_LIMIT:
    case COMPOSIO_SDK_ERROR_CODES.BACKEND.UNKNOWN:
      return {
        message: genericMessage,
        description: errorMessage || (predefinedError.description as string),
        possibleFix:
          predefinedError.possibleFix! ||
          (defaultErrorDetails.possibleFix as string),
        metadata,
      };

    default:
      const message = genericMessage || axiosError.message;
      const description =
        errorMessage || (predefinedError.description as string);
      const possibleFix =
        predefinedError.possibleFix! ||
        (defaultErrorDetails.possibleFix as string) ||
        "";
      return {
        message,
        description,
        possibleFix,
        metadata,
      };
  }
};

export const generateMetadataFromAxiosError = (
  axiosError: AxiosError<unknown> & {
    metadata?: Record<string, unknown>;
  }
): Record<string, unknown> => {
  const { requestId, ...restMetadata } = axiosError.metadata || {};
  return {
    fullUrl:
      (axiosError.config?.baseURL ?? "") + (axiosError.config?.url ?? ""),
    method: (axiosError.config?.method ?? "").toUpperCase(),
    statusCode: axiosError.response?.status,
    requestId: requestId ? `${requestId}` : undefined,
    metadata: restMetadata,
  };
};
