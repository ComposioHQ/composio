import { describe, expect, it } from "@jest/globals";
import AxiosMockAdapter from "axios-mock-adapter";
import { getTestConfig } from "../../config/getTestConfig";
import { client as axiosClient } from "./client/services.gen";
import { Composio } from "./index";
import { ComposioError } from "./utils/errors/src/composioError";
import {
  BASE_ERROR_CODE_INFO,
  COMPOSIO_SDK_ERROR_CODES,
} from "./utils/errors/src/constants";
const { COMPOSIO_API_KEY, BACKEND_HERMES_URL } = getTestConfig();

describe("Basic SDK spec suite", () => {
  it("should create a basic client", () => {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    expect(client).toBeInstanceOf(Composio);
  });

  it("should throw an error if apiKey is not provided", async () => {
    const originalExit = process.exit;

    // @ts-expect-error
    process.exit = jest.fn();
    expect(() => new Composio()).toThrow("🔑 API Key is not provided");
    process.exit = originalExit;
  });

  it("should handle 404 error gracefully", async () => {
    const mock = new AxiosMockAdapter(axiosClient.instance);
    const mockError = {
      type: "NotFoundError",
      name: "AppNotFoundError",
      message: "Not found",
    };
    mock.onGet("/api/v1/apps").reply(404, mockError);

    const client = new Composio({ apiKey: COMPOSIO_API_KEY });

    try {
      await client.apps.list();
    } catch (e) {
      if (e instanceof ComposioError) {
        expect(e.errCode).toBe(COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND);
        expect(e.description).toBe("Not found");
        expect(e.errorId).toBeDefined();
        expect(e.name).toBe("ComposioError");
        expect(e.possibleFix).toBe(e.possibleFix);
        expect(e.message).toContain(mockError.message);
        expect(e.message).toContain(mockError.name);
      } else {
        throw e;
      }
    }

    mock.reset();
  });

  it("should handle 400 error gracefully", async () => {
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock.onGet("/api/v1/apps").reply(400, {
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

    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    try {
      await client.apps.list();
    } catch (e) {
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.BACKEND.BAD_REQUEST;
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain("InvalidRequestError");
      expect(error.description).toContain(`Validation Errors: {"property":"triggerConfig","children":[],"constraints":{"isObject":"triggerConfig must be an object"}}`);
    }

    mock.reset();
  });

  it("should handle 500 and 502 error gracefully, and without backend fix", async () => {
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock.onGet("/api/v1/apps").reply(500, {
      type: "InternalServerError",
      name: "ServerError",
      message: "Internal Server Error",
    });
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    try {
      await client.apps.list();
    } catch (e) {
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_ERROR;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain(errorInfo.message);
      expect(error.description).toContain(errorInfo.description);
      expect(error.errorId).toBeDefined();
      expect(error.name).toBe("ComposioError");
      expect(error.possibleFix).toContain(errorInfo.possibleFix);
    }

    mock.onGet("/api/v1/apps").reply(502, { detail: "Bad Gateway" });

    try {
      await client.apps.list();
    } catch (e) {
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain(errorInfo.message);
      expect(error.description).toContain(errorInfo.description);
      expect(error.errorId).toBeDefined();
      expect(error.name).toBe("ComposioError");
      expect(error.possibleFix).toContain(errorInfo.possibleFix);
    }

    mock.reset();

    mock.onGet("/api/v1/apps").reply(500, {
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
      expect(error.message).toContain("AppNotFoundError - NotFoundError");
    }
  });

  it("should give request timeout error", async () => {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock.onGet("/api/v1/apps").reply(408, {});

    try {
      await client.apps.list();
    } catch (e) {
      const error = e as ComposioError;
      const errorCode = COMPOSIO_SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(error.errCode).toBe(errorCode);
      expect(error.message).toContain(errorInfo.message);
      expect(error.description).toBe(errorInfo.description);
      expect(error.possibleFix).toBe(errorInfo.possibleFix);
    }

    mock.reset();
  });

  it("syntax error handling", () => {
    expect(() => new Composio()).toThrow("🔑 API Key is not provided");
  });

  it("should get an entity and then fetch a connection", async () => {
    const app = "github";
    const composio = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: BACKEND_HERMES_URL,
    });
    const entity = composio.getEntity("default");

    expect(entity.id).toBe("default");

    const connection = await entity.getConnection({ app: app! });
    expect(connection?.appUniqueId).toBe(app);
  });
});
