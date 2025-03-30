import { beforeAll, describe, expect, it } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Apps } from "./apps";
import { Integrations } from "./integrations";

describe("Integrations class tests", () => {
  let integrations: Integrations;
  let createdIntegrationId: string;
  let apps: Apps;
  let appId: string;

  beforeAll(() => {
    const backendClient = getBackendClient();
    integrations = new Integrations(backendClient, backendClient.instance);
    apps = new Apps(backendClient, backendClient.instance);
  });

  it("Retrieve integrations list", async () => {
    const integrationsList = await integrations.list();
    expect(integrationsList?.items).toBeInstanceOf(Array);
    expect(integrationsList?.items).not.toHaveLength(0);
  });

  it("should create an integration and verify its properties", async () => {
    const app = await apps.get({ appKey: "github" });
    if (!app) throw new Error("App not found");
    appId = app.appId;

    const integrationCreation = await integrations.create({
      appId: appId,
      name: "test_integration_220",
      authScheme: "OAUTH2",
      useComposioAuth: true,
    });
    expect(integrationCreation.id).toBeTruthy();
    expect(integrationCreation.appName).toBe("github");

    // @ts-ignore
    createdIntegrationId = integrationCreation.id;
  });

  it("should retrieve the created integration by ID and verify its properties", async () => {
    const integration = await integrations.get({
      integrationId: createdIntegrationId,
    });
    expect(integration?.id).toBe(createdIntegrationId);
    expect(integration?.appId).toBe(appId);
    expect(integration?.authScheme).toBe("OAUTH2");
    expect(integration?.expectedInputFields).toBeDefined();
  });

  it("should get the required params for the created integration", async () => {
    const requiredParams = await integrations.getRequiredParams({
      integrationId: createdIntegrationId,
    });
    expect(requiredParams).toBeDefined();
  });

  it("should delete the created integration", async () => {
    if (!createdIntegrationId) return;
    await integrations.delete({ integrationId: createdIntegrationId });
  });
});
