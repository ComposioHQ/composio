import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import AxiosMockAdapter from "axios-mock-adapter";
import { getTestConfig } from "../../config/getTestConfig";
import { client as axiosClient } from "./client/services.gen";
import { Composio } from "./index";
import { ComposioError } from "./utils/errors/src/composioError";
import {
  BASE_ERROR_CODE_INFO,
  COMPOSIO_SDK_ERROR_CODES,
} from "./utils/errors/src/constants";
const { COMPOSIO_API_KEY } = getTestConfig();

describe("Basic SDK spec suite", () => {
  const mock = new AxiosMockAdapter(axiosClient.instance);

  beforeEach(() => {
    mock.reset();
  });

  it("should create a basic client", async () => {
    const client = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
    expect(client).toBeInstanceOf(Composio);
  });

  it.skip("should throw an error if apiKey is not provided", async () => {
    const originalExit = process.exit;

    // @ts-expect-error
    process.exit = jest.fn();
    expect(
      () => new Composio({ baseUrl: getTestConfig().BACKEND_HERMES_URL })
    ).toThrow("🔑 API Key is not provided");
    process.exit = originalExit;
  });

  it("should handle multiple clients with different API keys in the same process", async () => {
    const client1 = new Composio({
      apiKey: "api_key_1",
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });

    const client2 = new Composio({
      apiKey: "api_key_2",
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });

    // Get axios instances to verify they are different
    const axiosInstance1 = client1.backendClient.getAxiosInstance();
    const axiosInstance2 = client2.backendClient.getAxiosInstance();

    // Check that the instances are different objects
    expect(axiosInstance1).not.toBe(axiosInstance2);

    // Check that the API keys are set correctly in the headers
    expect(axiosInstance1.defaults.headers["X-API-KEY"]).toBe("api_key_1");
    expect(axiosInstance2.defaults.headers["X-API-KEY"]).toBe("api_key_2");

    // Verify that using client1 again returns the same instance
    const axiosInstanceAgain = client1.backendClient.getAxiosInstance();
    expect(axiosInstanceAgain).toBe(axiosInstance1);
  });

  it.skip("should handle 404 error gracefully", async () => {
    const mockError = {
      type: "NotFoundError",
      name: "AppNotFoundError",
      message: "Not found",
    };

    const client = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });

    const mock = new AxiosMockAdapter(client.backendClient.getAxiosInstance());

    mock.onGet(/.*\/api\/v1\/apps/).reply(404, mockError);
    let errorWasThrown = false;
    try {
      await client.apps.list();
    } catch (e) {
      errorWasThrown = true;
      if (e instanceof ComposioError) {
        expect(e.errCode).toBe(COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND);
        expect(e.description).toBe("Not found");
        expect(e.errorId).toBeDefined();
        expect(e.name).toBe("ComposioError");
        expect(e.possibleFix).toBe(e.possibleFix);
        expect(e.message).toContain(mockError.type);
        expect(e.message).toContain(mockError.name);
      } else {
        throw e;
      }
    }
    expect(errorWasThrown).toBe(true);
    mock.reset();
  });

  it.skip("should handle 400 error gracefully", async () => {
    let errorWasThrown = false;
    const client = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });

    const mock = new AxiosMockAdapter(client.backendClient.getAxiosInstance());
    mock.onGet(/.*\/api\/v1\/apps/).reply(400, {
      type: "BadRequestError",
      name: "InvalidRequestError",
      message: "Invalid request for apps",
      details: [
        {
          property: "triggerConfig",
          children: [],
          constraints: {
            isObject: "triggerConfig must be an object",
          },
        },
      ],
    });
    try {
      await client.apps.list();
    } catch (e) {
      errorWasThrown = true;
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.BACKEND.BAD_REQUEST;
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain("InvalidRequestError");
      expect(error.description).toContain(
        `Validation Errors: {"property":"triggerConfig","children":[],"constraints":{"isObject":"triggerConfig must be an object"}}`
      );
    }
    expect(errorWasThrown).toBe(true);
    mock.reset();
  });

  it.skip("should handle 500 and 502 error gracefully, and without backend fix", async () => {
    let errorWasThrown = false;
    const client = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
    const mock = new AxiosMockAdapter(client.backendClient.getAxiosInstance());
    mock.onGet(/.*\/api\/v1\/apps/).reply(500, {
      type: "InternalServerError",
      name: "ServerError",
      message: "Internal Server Error",
    });
    try {
      await client.apps.list();
    } catch (e) {
      errorWasThrown = true;
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_ERROR;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain("ServerError - InternalServerError");
      expect(error.description).toContain("Internal Server");
      expect(error.errorId).toBeDefined();
      expect(error.name).toBe("ComposioError");
      expect(error.possibleFix).toContain(errorInfo.possibleFix);
    }
    expect(errorWasThrown).toBe(true);
    mock.onGet(/.*\/api\/v1\/apps/).reply(502, { detail: "Bad Gateway" });

    try {
      await client.apps.list();
    } catch (e) {
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain(errorInfo.message);
      expect(error.description).toContain(
        "er is currently unable to handle the reque"
      );
      expect(error.errorId).toBeDefined();
      expect(error.name).toBe("ComposioError");
      expect(error.possibleFix).toContain(errorInfo.possibleFix);
    }

    mock.reset();

    mock.onGet(/.*\/api\/v1\/apps/).reply(500, {
      error: {
        type: "NotFoundError",
        name: "AppNotFoundError",
        message: "Not found",
      },
    });
    try {
      await client.apps.list();
    } catch (e) {
      const error = e as ComposioError;
      expect(error.errCode).toBe(COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_ERROR);
    }
    mock.reset();
  });

  it.skip("should give request timeout error", async () => {
    const client = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
    const mock = new AxiosMockAdapter(client.backendClient.getAxiosInstance());

    mock.onGet(/.*\/api\/v1\/apps/).reply(408, {
      error: {
        type: "NotFoundError",
        name: "AppNotFoundError",
        message: "Not found",
      },
    });
    let errorWasThrown = false;
    try {
      await client.apps.list();
    } catch (e) {
      errorWasThrown = true;
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain(errorInfo.message);
      expect(error.description).toBe(errorInfo.description);
      expect(error.possibleFix).toBe(errorInfo.possibleFix);
    }

    expect(errorWasThrown).toBe(true);
    mock.reset();
  });

  it("syntax error handling", async () => {
    expect(() => new Composio()).toThrow("🔑 API Key is not provided");
  });

  afterEach(() => {
    mock.reset();
    mock.resetHandlers();
    mock.restore();
  });
});
