import { describe, it, expect, beforeAll } from "@jest/globals";
import { Apps } from "./apps";
import { BACKEND_CONFIG, getTestConfig } from "../../../config/getTestConfig";
import { BackendClient } from "./backendClient";

describe("Apps class tests", () => {
    let backendClient;
    let testConfig:BACKEND_CONFIG;

    beforeAll(() => {
        testConfig = getTestConfig();
    });

    it("should create an Apps instance and retrieve apps list", async () => {
        backendClient = new BackendClient(testConfig.COMPOSIO_API_KEY, testConfig.BACKEND_HERMES_URL);
    });

    it("should throw an error if api key is not provided", async () => {
        expect(() => new BackendClient("", testConfig.BACKEND_HERMES_URL)).toThrow('API Key is required for initializing the client');
    });

    it("should throw and error if wrong base url is provided", async () => {
        expect(() => new BackendClient(testConfig.COMPOSIO_API_KEY, "htt://wrong.url")).toThrow('Base URL is not valid');
    });

});
