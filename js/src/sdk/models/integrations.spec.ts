import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Integrations } from "./integrations";

describe("Integrations class tests", () => {
    let backendClient;
    let integrations: Integrations;
    let createdIntegrationId: string;

    beforeAll(() => {
        backendClient = getBackendClient();
        integrations = new Integrations(backendClient);
    });

    it("Retrieve integrations list", async () => {
        const integrationsList = await integrations.list();
        expect(integrationsList?.items).toBeInstanceOf(Array);
        expect(integrationsList?.items).not.toHaveLength(0);    
    }); 

    it("should create an integration and verify its properties", async () => {
        const integrationCreation = await integrations.create({
            appId: "01e22f33-dc3f-46ae-b58d-050e4d2d1909",
            name: "test_integration_220",
            useComposioAuth: true,
            // @ts-ignore
            forceNewIntegration:true
        });
        expect(integrationCreation.id).toBeTruthy();
        expect(integrationCreation.appName).toBe("github");

        createdIntegrationId = integrationCreation.id;
    }); 

    it("should retrieve the created integration by ID and verify its properties", async () => {
        const integration = await integrations.get({
            integrationId: createdIntegrationId
        });
        expect(integration.id).toBe(createdIntegrationId);
        expect(integration.appId).toBe("01e22f33-dc3f-46ae-b58d-050e4d2d1909");
        expect(integration.authScheme).toBe("OAUTH2");
    });

    it("should delete the created integration", async () => {
        if (!createdIntegrationId) return;
        await integrations.delete({
            path:{
                integrationId: createdIntegrationId
            }
        });
    });
});
