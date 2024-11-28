import { ERROR, PREDEFINED_ERROR_REGISTRY } from "./errors/constants";
import { ifObjectStringify, ComposioError } from "./errors/base";
import { getBackendErrorResponseFormat } from "./errors/backendErrorResponse";

// Composio Error Generator - handles error creation and formatting
export class CEG {
    // Handle errors without HTTP response (network issues, etc)
    private static handleNonResponseError(error: any) {
        const description = `❌ ${ifObjectStringify(error.description || error.message) || "No additional information available."}`;
        
        throw new ComposioError(
            ERROR.COMMON.UNKNOWN,
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
        possibleFix 
    }: {
        type?: string;
        subtype?: string;
        message?: string;
        description?: string;
        possibleFix?: string;
    }): never {
        const finalErrorCode = !!messageCode ? messageCode : `${type}::${subtype}`;
        const errorDetails = PREDEFINED_ERROR_REGISTRY[finalErrorCode] || PREDEFINED_ERROR_REGISTRY.UNKNOWN;
      
        const finalMessage = message || errorDetails.message || "";
        const finalDescription = description || errorDetails.description || undefined;
        const finalPossibleFix = possibleFix || errorDetails.possibleFix || "";
        throw new ComposioError(finalErrorCode, finalMessage, finalDescription, finalPossibleFix);
    }
}