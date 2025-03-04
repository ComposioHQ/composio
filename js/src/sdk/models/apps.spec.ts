import { beforeAll, describe, expect, it } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Apps } from "./apps";

describe("Apps class tests", () => {
  let backendClient;
  let apps: Apps;

  beforeAll(() => {
    backendClient = getBackendClient();
    apps = new Apps(backendClient, backendClient.instance);
  });

  it("should create an Apps instance and retrieve apps list", async () => {
    const appsList = await apps.list();
    expect(appsList).toBeInstanceOf(Array);
    expect(appsList).not.toHaveLength(0);

    const firstItem = appsList[0];
    expect(firstItem).toHaveProperty("appId");
    expect(firstItem).toHaveProperty("key");
    expect(firstItem).toHaveProperty("name");
  });

  it("should get details of a specific app by key", async () => {
    const appKey = "github";
    const app = await apps.get({ appKey });
    expect(app).toBeDefined();
    expect(app).toHaveProperty("auth_schemes");
    // @ts-ignore
    expect(app.auth_schemes[0]).toHaveProperty("auth_mode", "OAUTH2");
    expect(app).toHaveProperty("key", appKey);
    expect(app).toHaveProperty("name", "github");
    expect(app).toHaveProperty("description");
  });

  it("should return undefined for an invalid app key", async () => {
    try {
      const app = await apps.get({ appKey: "nonexistent_key" });
      expect(app).toBeUndefined();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it("should get required params for a specific app", async () => {
    const inputFields = await apps.getRequiredParams("shopify");

    expect(inputFields).toHaveProperty("availableAuthSchemes");
    expect(inputFields).toHaveProperty("authSchemes");

    const OAUTH2_SCHEME = "OAUTH2";
    expect(inputFields.availableAuthSchemes).toContain(OAUTH2_SCHEME);
    expect(inputFields.authSchemes[OAUTH2_SCHEME].expected_from_user).toEqual([
      "client_id",
      "client_secret",
    ]);
    expect(inputFields.authSchemes[OAUTH2_SCHEME].optional_fields).toEqual([
      "oauth_redirect_uri",
      "scopes",
    ]);
    expect(inputFields.authSchemes[OAUTH2_SCHEME].required_fields).toEqual([
      "shop",
    ]);
  });

  it("should get required params for a specific auth scheme", async () => {
    const OAUTH2_SCHEME = "OAUTH2";
    const requiredParams = await apps.getRequiredParamsForAuthScheme({
      appId: "shopify",
      authScheme: OAUTH2_SCHEME,
    });
    expect(requiredParams).toEqual({
      required_fields: ["shop"],
      optional_fields: ["oauth_redirect_uri", "scopes"],
      expected_from_user: ["client_id", "client_secret"],
    });
  });
});
