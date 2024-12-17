import { describe, it, expect } from "@jest/globals";
import { Composio } from "./index";
import { getTestConfig } from "../../config/getTestConfig";
import { client as axiosClient } from "./client/services.gen";
import {
  BASE_ERROR_CODE_INFO,
  SDK_ERROR_CODES,
} from "./utils/errors/src/constants";
import AxiosMockAdapter from "axios-mock-adapter";
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
    // @ts-expect-error
    expect(() => new Composio()).toThrow("🔑 API Key is not provided");
    process.exit = originalExit;
  });

  it("should handle 404 error gracefully", async () => {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock.onGet("/api/v1/apps").reply(404, { detail: "Not found" });

    try {
      await client.apps.list();
    } catch (e: any) {
      const errorCode = SDK_ERROR_CODES.BACKEND.NOT_FOUND;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(e.errCode).toBe(errorCode);
      expect(e.message).toContain(errorInfo.message);
      expect(e.description).toBe(errorInfo.description);
      expect(e.errorId).toBeDefined();
      expect(e.name).toBe("ComposioError");
      expect(e.possibleFix).toBe(errorInfo.possibleFix);
    }

    mock.reset();
  });

  it("should handle 400 error gracefully", async () => {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock
      .onGet("/api/v1/apps")
      .reply(400, { errors: ["Invalid request for apps"] });

    try {
      await client.apps.list();
    } catch (e: any) {
      const errorCode = SDK_ERROR_CODES.BACKEND.BAD_REQUEST;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(e.errCode).toBe(errorCode);
      expect(e.message).toContain(
        "Validation Errors while making request to https://backend.composio.dev/api/v1/apps"
      );
      expect(e.description).toContain("Invalid request for apps");
    }

    mock.reset();
  });

  it("should handle 500 and 502 error gracefully", async () => {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock.onGet("/api/v1/apps").reply(500, { detail: "Internal Server Error" });

    try {
      await client.apps.list();
    } catch (e: any) {
      const errorCode = SDK_ERROR_CODES.BACKEND.SERVER_ERROR;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(e.errCode).toBe(errorCode);
      expect(e.message).toContain(errorInfo.message);
      expect(e.description).toContain(errorInfo.description);
      expect(e.errorId).toBeDefined();
      expect(e.name).toBe("ComposioError");
      expect(e.possibleFix).toContain(errorInfo.possibleFix);
    }

    mock.onGet("/api/v1/apps").reply(502, { detail: "Bad Gateway" });

    try {
      const apps = await client.apps.list();
    } catch (e: any) {
      const errorCode = SDK_ERROR_CODES.BACKEND.SERVER_UNAVAILABLE;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(e.errCode).toBe(errorCode);
      expect(e.message).toContain(errorInfo.message);
      expect(e.description).toContain(errorInfo.description);
      expect(e.errorId).toBeDefined();
      expect(e.name).toBe("ComposioError");
      expect(e.possibleFix).toContain(errorInfo.possibleFix);
    }

    mock.reset();
  });

  it("should give request timeout error", async () => {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    const mock = new AxiosMockAdapter(axiosClient.instance);
    mock.onGet("/api/v1/apps").reply(408, {});

    try {
      await client.apps.list();
    } catch (e: any) {
      const errorCode = SDK_ERROR_CODES.COMMON.REQUEST_TIMEOUT;
      const errorInfo = BASE_ERROR_CODE_INFO[errorCode];
      expect(e.errCode).toBe(errorCode);
      expect(e.message).toContain(errorInfo.message);
      expect(e.description).toBe(errorInfo.description);
      expect(e.possibleFix).toBe(errorInfo.possibleFix);
    }

    mock.reset();
  });

  it("syntax error handling", () => {
    // @ts-expect-error
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
    expect(connection.appUniqueId).toBe(app);
  });
});
