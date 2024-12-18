import { AxiosError } from "axios";
import { SDK_ERROR_CODES } from "./constants";

export interface ErrorResponseData {
  message: string;
  error: string;
  errors?: Record<string, unknown>[];
}

interface ErrorDetails {
  message: string;
  description: string;
  possibleFix: string;
  metadata?: Record<string, unknown>;
}

export const getAPIErrorDetails = (
  errorKey: string,
  axiosError: AxiosError<ErrorResponseData>,
  predefinedError: Record<string, unknown>
): ErrorDetails => {
  const defaultErrorDetails = {
    message: axiosError.message,
    description:
      axiosError.response?.data?.message ||
      axiosError.response?.data?.error ||
      axiosError.message,
    possibleFix:
      "Please check the network connection, request parameters, and ensure the API endpoint is correct.",
  };

  const metadata = generateMetadataFromAxiosError(axiosError);
  switch (errorKey) {
    case SDK_ERROR_CODES.BACKEND.NOT_FOUND:
    case SDK_ERROR_CODES.BACKEND.UNAUTHORIZED:
    case SDK_ERROR_CODES.BACKEND.SERVER_ERROR:
    case SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE:
    case SDK_ERROR_CODES.BACKEND.RATE_LIMIT:
      return {
        message: `${predefinedError.message || axiosError.message} for ${axiosError.config?.baseURL! + axiosError.config?.url!}`,
        description: (axiosError.response?.data?.message! ||
          predefinedError.description) as string,
        possibleFix: (predefinedError.possibleFix! ||
          defaultErrorDetails.possibleFix) as string,
        metadata,
      };

    case SDK_ERROR_CODES.BACKEND.BAD_REQUEST:
      const validationErrors = axiosError.response?.data?.errors;
      const formattedErrors = Array.isArray(validationErrors)
        ? validationErrors
            .map((err) => JSON.stringify(err as Record<string, unknown>))
            .join(", ")
        : JSON.stringify(
            validationErrors as unknown as Record<string, unknown>
          );

      return {
        message: `Validation Errors while making request to ${axiosError.config?.baseURL! + axiosError.config?.url!}`,
        description: `Validation Errors: ${formattedErrors}`,
        possibleFix:
          "Please check the request parameters and ensure they are correct.",
        metadata,
      };

    case SDK_ERROR_CODES.BACKEND.UNKNOWN:
    case SDK_ERROR_CODES.COMMON.UNKNOWN:
      return {
        message: `${axiosError.message} for ${axiosError.config?.baseURL! + axiosError.config?.url!}`,
        description: (axiosError.response?.data?.message! ||
          axiosError.response?.data?.error! ||
          axiosError.message) as string,
        possibleFix: "Please contact tech@composio.dev with the error details.",
        metadata,
      };

    default:
      return {
        message: `${predefinedError.message || axiosError.message} for ${axiosError.config?.baseURL! + axiosError.config?.url!}`,
        description: (axiosError.response?.data?.message! ||
          predefinedError.description) as string,
        possibleFix: (predefinedError.possibleFix! ||
          defaultErrorDetails.possibleFix) as string,
        metadata,
      };
  }
};

export const generateMetadataFromAxiosError = (
  axiosError: AxiosError<unknown> & {
    metadata?: Record<string, unknown>;
  }
): Record<string, unknown> => {
  const requestId = axiosError.response?.headers["x-request-id"];
  return {
    fullUrl:
      (axiosError.config?.baseURL ?? "") + (axiosError.config?.url ?? ""),
    method: (axiosError.config?.method ?? "").toUpperCase(),
    statusCode: axiosError.response?.status,
    requestId: requestId ? `Request ID: ${requestId}` : undefined,
    metadata: axiosError.metadata,
  };
};
