import { SDK_ERROR_CODES, BASE_ERROR_CODE_INFO } from "./errors/src/codes";
import { ComposioError } from "./errors/src/base";
import { makeAPIError } from "./errors/src/formatter";
import { AxiosError } from "axios";
import { ifObjectStringify } from "./common";

type NonResponseError = {
    config: {
        baseURL: string;
        url: string;
    };
    description: string;
    message: string;
    code: string;
}

export class CEG {
    private static handleNonResponseError(error: NonResponseError) {
        const fullUrl = error.config.baseURL + error.config.url;
        if(error.code === "ECONNREFUSED"){
            return this.throwCustomError(SDK_ERROR_CODES.COMMON.BASE_URL_NOT_REACHABLE, {
                message: `ECONNREFUSED for ${fullUrl}`,
                description: `End point at ${fullUrl} is refusing to connect.`,
                possibleFix: "Make sure:\n1. The base URL is correct and is accessible\n2. Your network connection is stable\n3. There are no firewall rules blocking the connection",
                originalError: error
            });
        }

        if(error.code === "ECONNABORTED"){
            return this.throwCustomError(SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT, {
                message: `ECONNABORTED for ${fullUrl}`,
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

    static handleError(axiosError: unknown) {
        if (!axiosError || typeof axiosError !== 'object') {
            throw new ComposioError(
                SDK_ERROR_CODES.COMMON.UNKNOWN,
                "Invalid error object received",
                "The error handler received an invalid or empty error object",
                "Please ensure a valid error object is being passed",
                axiosError
            );
        }
        if (!('response' in axiosError)) {
            return this.handleNonResponseError(axiosError as unknown as NonResponseError);
        }
        const errorBody = makeAPIError(axiosError as AxiosError);
        throw new ComposioError(
            errorBody.errorKey,
            errorBody.message,
            errorBody.description,
            errorBody.possibleFix,
            axiosError
        );
    }

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
        originalError?: unknown;
    }): never {
        const finalErrorCode = !!messageCode ? messageCode : `${type}::${subtype}`;
        const errorDetails = BASE_ERROR_CODE_INFO[finalErrorCode] || BASE_ERROR_CODE_INFO.UNKNOWN;
      
        const finalMessage = message || errorDetails.message || "";
        const finalDescription = description || errorDetails.description || undefined;
        const finalPossibleFix = possibleFix || errorDetails.possibleFix || "";
        
        throw new ComposioError(messageCode, finalMessage, finalDescription, finalPossibleFix, originalError);
    }
}