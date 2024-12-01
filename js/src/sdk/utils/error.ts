import { SDK_ERROR_CODES, BASE_ERROR_CODE_INFO } from "./errors/constants";
import {  ComposioError } from "./errors/base";
import { getBackendErrorResponseFormat } from "./errors/backendErrorResponse";
import { ifObjectStringify } from "./common";

// Composio Error Generator - handles error creation and formatting
export class CEG {
    // Handle errors without HTTP response (network issues, etc)
    private static handleNonResponseError(error: any) {
        const fullUrl = error.config.baseURL + error.config.url;
        if(error.code === "ECONNREFUSED"){
            return this.throwCustomError(SDK_ERROR_CODES.COMMON.BASE_URL_INVALID, {
                description: `Unable to establish connection with Composio API at ${fullUrl}. This typically indicates either the API endpoint is incorrect, the server is down, or there are network connectivity issues. Error code: ECONNREFUSED`,
                possibleFix: "Please verify:\n1. The base URL is correct\n2. Your network connection is stable\n3. There are no firewall rules blocking the connection\n4. The Composio API service is operational",
                originalError: error
            });
        }

        if(error.code === "ECONNABORTED"){
            return this.throwCustomError(SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT, {
                description: `Request to ${fullUrl} timed out after the configured timeout period. This could be due to slow network conditions, server performance issues, or the request being too large. Error code: ECONNABORTED`,
                possibleFix: "Try:\n1. Checking your network speed and stability\n2. Increasing the request timeout setting if needed\n3. Breaking up large requests into smaller chunks\n4. Retrying the request when network conditions improve\n5. Contact tech@composio.dev if the issue persists",
                originalError: error
            });
        }
        const description = `❌ ${ifObjectStringify(error.description || error.message) || "No additional information available."}`;
        
        throw new ComposioError(
            SDK_ERROR_CODES.COMMON.UNKNOWN,
            error.message,
            description,
            "Please contact tech@composio.dev with the error details.",
            error
        );
    }

    // Main error handler for Axios errors and generic errors
    static handleError(axiosError: any) {
        // Handle non-response errors (network issues, etc.)
        if (!axiosError.response) {
            return this.handleNonResponseError(axiosError);
        }
        const errorBody = getBackendErrorResponseFormat(axiosError);
        throw new ComposioError(
            errorBody.errorKey,
            errorBody.message,
            errorBody.description,
            errorBody.possibleFix,
            axiosError
        );;
    }

    // This method allows throwing custom errors with configurable details
    // @param messageCode - The error code to use, either a predefined code from ERROR constants or a custom one
    // @param options - Configuration object containing:
    //   - message: Custom error message to override default
    //   - type: Error type for generating error code if messageCode not provided 
    //   - subtype: Error subtype for generating error code if messageCode not provided
    //   - description: Additional error details/context
    //   - possibleFix: Suggested solution for the error
    // @throws ComposioError with the configured details
    static throwCustomError(messageCode: string, {
        message,
        type,
        subtype,
        description,
        possibleFix,
        originalError
    }: {
        type?: string;
        subtype?: string;
        message?: string;
        description?: string;
        possibleFix?: string;
        originalError?: any;
    }): never {
        const finalErrorCode = !!messageCode ? messageCode : `${type}::${subtype}`;
        const errorDetails = BASE_ERROR_CODE_INFO[finalErrorCode] || BASE_ERROR_CODE_INFO.UNKNOWN;
      
        const finalMessage = message || errorDetails.message || "";
        const finalDescription = description || errorDetails.description || undefined;
        const finalPossibleFix = possibleFix || errorDetails.possibleFix || "";
        
        throw new ComposioError(messageCode, finalMessage, finalDescription, finalPossibleFix, originalError);
    }
}