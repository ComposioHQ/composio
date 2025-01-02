import { AxiosError } from "axios";
import { ZodError } from "zod";
import { ComposioError } from "./errors/src/composioError";
import {
  API_TO_SDK_ERROR_CODE,
  BASE_ERROR_CODE_INFO,
  COMPOSIO_SDK_ERROR_CODES,
} from "./errors/src/constants";
import {
  ErrorResponseData,
  generateMetadataFromAxiosError,
  getAPIErrorDetails,
} from "./errors/src/formatter";

export class CEG {
  static handleAllError(error: unknown, shouldThrow: boolean = false) {
    if (error instanceof ComposioError) {
      if (shouldThrow) {
        throw error;
      }
      return error;
    }

    if (!(error instanceof Error)) {
      const error = new Error("Passed error is not an instance of Error");
      if (shouldThrow) {
        throw error;
      }
      return error;
    }

    if (error instanceof ZodError) {
      const zodError = this.returnZodError(error);
      if (shouldThrow) {
        throw zodError;
      }
      return zodError;
    }

    const isAxiosError = (error as AxiosError).isAxiosError;

    if (!isAxiosError) {
      const customError = this.getCustomError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.UNKNOWN,
        {
          message: error.message,
          description: "",
          possibleFix: "Please check error message and stack trace",
          originalError: error,
          metadata: {},
        }
      );
      if (shouldThrow) {
        throw customError;
      }
      return customError;
    } else {
      const isResponseNotPresent = !("response" in error);
      if (isResponseNotPresent) {
        const nonResponseError = this.handleNonResponseAxiosError(
          error as AxiosError
        );
        if (shouldThrow) {
          throw nonResponseError;
        }
        return nonResponseError;
      }
      const apiError = this.throwAPIError(error as AxiosError);
      if (shouldThrow) {
        throw apiError;
      }
      return apiError;
    }
  }

  private static handleNonResponseAxiosError(error: AxiosError) {
    const fullUrl = (error.config?.baseURL || "") + (error.config?.url || "");
    const metadata = generateMetadataFromAxiosError(error);

    if (error.code === "ECONNREFUSED") {
      throw new ComposioError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.BASE_URL_NOT_REACHABLE,
        `ECONNREFUSED for ${fullUrl}`,
        "",
        "Make sure:\n1. The base URL is correct and is accessible\n2. Your network connection is stable\n3. There are no firewall rules blocking the connection",
        metadata,
        error
      );
    }

    if (error.code === "ETIMEDOUT") {
      throw new ComposioError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT,
        `ECONNABORTED for ${fullUrl}`,
        `Request to ${fullUrl} timed out after the configured timeout period. This could be due to slow network conditions, server performance issues, or the request being too large. Error code: ETIMEDOUT`,
        "Try:\n1. Checking your network speed and stability\n2. Increasing the request timeout setting if needed\n3. Breaking up large requests into smaller chunks\n4. Retrying the request when network conditions improve\n5. Contact tech@composio.dev if the issue persists",
        metadata,
        error
      );
    }

    if (error.code === "ECONNABORTED") {
      throw new ComposioError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.REQUEST_ABORTED,
        error.message,
        "The request was aborted due to a timeout or other network-related issues. This could be due to network instability, server issues, or the request being too large. Error code: ECONNABORTED",
        "Try:\n1. Checking your network speed and stability\n2. Increasing the request timeout setting if needed\n3. Breaking up large requests into smaller chunks\n4. Retrying the request when network conditions improve\n5. Contact tech@composio.dev if the issue persists",
        metadata,
        error
      );
    }

    throw new ComposioError(
      COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNREACHABLE,
      error.message ||
        "Server is unreachable. Please contact tech@composio.dev with the error details.",
      "Server is unreachable. Please contact tech@composio.dev with the error details.",
      "Please contact tech@composio.dev with the error details.",
      metadata,
      error
    );
  }

  static throwAPIError(error: AxiosError) {
    const statusCode = error?.response?.status || null;
    const errorCode = statusCode
      ? API_TO_SDK_ERROR_CODE[statusCode] ||
        COMPOSIO_SDK_ERROR_CODES.BACKEND.UNKNOWN
      : COMPOSIO_SDK_ERROR_CODES.BACKEND.UNKNOWN;

    const errorDetails = getAPIErrorDetails(
      error as AxiosError<ErrorResponseData>
    );

    const metadata = generateMetadataFromAxiosError(error);
    throw new ComposioError(
      errorCode,
      errorDetails.message,
      errorDetails.description,
      errorDetails.possibleFix,
      metadata,
      error
    );
  }

  static returnZodError(error: ZodError) {
    const errorCode = COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED;
    const errorMessage = error.message;
    const errorDescription = "The parameters passed are invalid";
    const possibleFix = "Please check error message for more details";
    const metadata = {
      issues: error.issues,
    };

    return new ComposioError(
      errorCode,
      errorMessage,
      errorDescription,
      possibleFix,
      metadata,
      error
    );
  }

  static getCustomError(
    messageCode: string,
    {
      message,
      type,
      subtype,
      description,
      possibleFix,
      originalError,
      metadata,
    }: {
      type?: string;
      subtype?: string;
      message: string;
      description: string;
      possibleFix?: string;
      originalError?: unknown;
      metadata?: Record<string, unknown>;
    }
  ): never {
    const finalErrorCode = !!messageCode ? messageCode : `${type}::${subtype}`;
    const errorDetails =
      BASE_ERROR_CODE_INFO[finalErrorCode] || BASE_ERROR_CODE_INFO.UNKNOWN;

    const finalMessage = message || errorDetails.message || "";
    const finalDescription =
      description || errorDetails.description || undefined;
    const finalPossibleFix = possibleFix || errorDetails.possibleFix || "";

    throw new ComposioError(
      messageCode,
      finalMessage,
      finalDescription,
      finalPossibleFix,
      metadata,
      originalError
    );
  }
}
