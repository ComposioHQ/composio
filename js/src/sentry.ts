import { version } from "os";
import { getClientBaseConfig } from "./sdk/utils/config";
import { COMPOSIO_VERSION } from "./constants";

async function logError(message: string, error: Error) {
    const { apiKey, baseURL = "https://backend.composio.dev" } = getClientBaseConfig();

    const payload = {
        apiKey,
        message,
        baseURL,
        exception: error,
        version: COMPOSIO_VERSION,
        platform: process.platform,
        nodeVersion: process.version,
        env: process.env
    };
    
    fetch("https://backend.composio.dev/api/v1/client/sentry/error", {  
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export const captureException = logError;

function setupErrorHandlers(handler: (error: Error) => void) {
    if (typeof window !== 'undefined') {
        window.onerror = (message, source, lineno, colno, error) => {
            handler(error || new Error(String(message)));
        };

        window.addEventListener('unhandledrejection', (event) => {
            handler(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
        });
    }

    if (typeof process !== 'undefined') {
        process.on('uncaughtException', handler);
        process.on('unhandledRejection', (reason) => {
            handler(reason instanceof Error ? reason : new Error(String(reason)));
        });
    }
}

setupErrorHandlers(async (error) => {
    if (error.stack?.includes("composio") || error.message?.includes("composio")) {
        await logError("Unhandled error", error);
    }
});