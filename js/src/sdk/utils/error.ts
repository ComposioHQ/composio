import { SDK_ERROR_CODES, BASE_ERROR_CODE_INFO, BE_STATUS_CODE_TO_SDK_ERROR_CODES } from "./errors/src/constants";
import { ComposioError } from "./errors/src/composioError";
import { generateMetadataFromAxiosError, getAPIErrorDetails } from "./errors/src/formatter";
import { AxiosError } from "axios";
import { ZodError } from "zod";

export class CEG {
    
    static handleAllError(error: unknown) {
        if(error instanceof ComposioError) {
            throw error;
        }

        if (!(error instanceof Error)) {
            throw new Error("Passed error is not an instance of Error");
        }

        if(error instanceof ZodError) {
            this.throwZodError(error);
        }

        const isAxiosError = (error as AxiosError).isAxiosError;

        if (!isAxiosError) {
             this.throwCustomError(SDK_ERROR_CODES.COMMON.UNKNOWN, {
                message: error.message,
                description: "",
                possibleFix: "Please check error message and stack trace",
                originalError: error,
                metadata: {}
            });
        } else {
            const isResponseNotPresent = !('response' in error);    
            if(isResponseNotPresent) {
                this.handleNonResponseAxiosError(error as AxiosError);
            }
            this.throwAPIError(error as AxiosError);
        }
    }
    private static handleNonResponseAxiosError(error: AxiosError) {
        const fullUrl = (error.config?.baseURL || "") + (error.config?.url || "");
        const metadata = generateMetadataFromAxiosError(error);

        if (error.code === "ECONNREFUSED") {
            throw new ComposioError(
                SDK_ERROR_CODES.COMMON.BASE_URL_NOT_REACHABLE,
                `ECONNREFUSED for ${fullUrl}`,
                "",
                "Make sure:\n1. The base URL is correct and is accessible\n2. Your network connection is stable\n3. There are no firewall rules blocking the connection",
                metadata,
                error
            );
        }

        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
            throw new ComposioError(
                SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT,
                `ECONNABORTED for ${fullUrl}`,
                `Request to ${fullUrl} timed out after the configured timeout period. This could be due to slow network conditions, server performance issues, or the request being too large. Error code: ECONNABORTED`,
                "Try:\n1. Checking your network speed and stability\n2. Increasing the request timeout setting if needed\n3. Breaking up large requests into smaller chunks\n4. Retrying the request when network conditions improve\n5. Contact tech@composio.dev if the issue persists",
                metadata,
                error
            );
        }

        throw new ComposioError(
            SDK_ERROR_CODES.COMMON.UNKNOWN,
            error.message,
            "",
            "Please contact tech@composio.dev with the error details.",
            metadata,
            error
        );
    }

    static throwAPIError(error: AxiosError) {
        const statusCode = error?.response?.status || null;
        const errorCode = statusCode ? BE_STATUS_CODE_TO_SDK_ERROR_CODES[statusCode] || SDK_ERROR_CODES.BACKEND.UNKNOWN : SDK_ERROR_CODES.BACKEND.UNKNOWN;
        const predefinedError = BASE_ERROR_CODE_INFO[errorCode];

        const errorDetails = getAPIErrorDetails(errorCode, error, predefinedError);
   
        const metadata = generateMetadataFromAxiosError(error);
        throw new ComposioError(errorCode, errorDetails.message, errorDetails.description, errorDetails.possibleFix, metadata, error)
    }

    static throwZodError(error: ZodError) {
        const errorCode = SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED;
        const errorMessage = error.message;
        const errorDescription = "The parameters passed are invalid";
        const possibleFix = "Please check the metadata.issues for more details";
        const metadata = {
            issues: error.issues
        };
        
        throw new ComposioError(errorCode, errorMessage, errorDescription, possibleFix, metadata, error);
    }

    static throwCustomError(messageCode: string, {
        message,
        type,
        subtype,
        description,
        possibleFix,
        originalError,
        metadata
    }: {
        type?: string;
        subtype?: string;
        message?: string;
        description?: string;
        possibleFix?: string;
        originalError?: unknown;
        metadata?: Record<string, any>;
    }): never {
        const finalErrorCode = !!messageCode ? messageCode : `${type}::${subtype}`;
        const errorDetails = BASE_ERROR_CODE_INFO[finalErrorCode] || BASE_ERROR_CODE_INFO.UNKNOWN;

        const finalMessage = message || errorDetails.message || "";
        const finalDescription = description || errorDetails.description || undefined;
        const finalPossibleFix = possibleFix || errorDetails.possibleFix || "";

        throw new ComposioError(messageCode, finalMessage, finalDescription, finalPossibleFix, metadata, originalError);
    }
}