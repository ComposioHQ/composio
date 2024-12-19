import { beforeAll, describe, expect, it } from "@jest/globals";
import { BACKEND_CONFIG, getTestConfig } from "../../../config/getTestConfig";
import { BackendClient } from "./backendClient";

describe("Apps class tests", () => {
  let _backendClient;
  let testConfig: BACKEND_CONFIG;

  beforeAll(() => {
    testConfig = getTestConfig();
  });

  it("should create an Apps instance and retrieve apps list", async () => {
    _backendClient = new BackendClient(
      testConfig.COMPOSIO_API_KEY,
      testConfig.BACKEND_HERMES_URL
    );
  });

  it("should throw an error if api key is not provided", async () => {
    expect(() => new BackendClient("", testConfig.BACKEND_HERMES_URL)).toThrow(
      "🔑 API Key Missing or Invalid"
    );
  });

  it("should throw and error if wrong base url is provided", async () => {
    expect(
      () => new BackendClient(testConfig.COMPOSIO_API_KEY, "htt://wrong.url")
    ).toThrow("🔗 Base URL htt://wrong.url is not valid");
  });
});
