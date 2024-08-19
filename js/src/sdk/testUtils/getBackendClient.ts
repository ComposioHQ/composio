import { BackendClient } from "../models/backendClient";
import { getTestConfig } from "../../../config/getTestConfig";


export const getBackendClient = (): BackendClient => {
    const testConfig = getTestConfig();
    if (testConfig["COMPOSIO_API_KEY"] === undefined) {
        throw new Error("COMPOSIO_API_KEY is not set in the test config");
    }
    if (testConfig["BACKEND_HERMES_URL"] === undefined) {
        throw new Error("BACKEND_HERMES_URL is not set in the test config.");
    }
    const COMPOSIO_API_KEY = testConfig["COMPOSIO_API_KEY"];
    const BACKEND_HERMES_URL = testConfig["BACKEND_HERMES_URL"];
    return new BackendClient(COMPOSIO_API_KEY, BACKEND_HERMES_URL);
}