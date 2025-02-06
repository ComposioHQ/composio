import { getTestConfig } from "../../../config/getTestConfig";
import { AxiosBackendClient } from "../models/backendClient";

export const getBackendClient = (): AxiosBackendClient => {
  const testConfig = getTestConfig();
  if (testConfig["COMPOSIO_API_KEY"] === undefined) {
    throw new Error("COMPOSIO_API_KEY is not set in the test config");
  }
  if (testConfig["BACKEND_HERMES_URL"] === undefined) {
    throw new Error("BACKEND_HERMES_URL is not set in the test config.");
  }
  const COMPOSIO_API_KEY = testConfig["COMPOSIO_API_KEY"];
  const BACKEND_HERMES_URL = testConfig["BACKEND_HERMES_URL"];
  return new AxiosBackendClient(COMPOSIO_API_KEY, BACKEND_HERMES_URL);
};
