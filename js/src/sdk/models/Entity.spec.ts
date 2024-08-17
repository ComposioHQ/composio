import { describe, it, expect } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Entity } from "./Entity";

describe("Entity class tests", () => {
    let backendClient = getBackendClient();
    let entity: Entity;
    let triggerId: string;

    beforeAll(() => {
        entity = new Entity(backendClient, "default");
    });

    it("should create an Entity instance with 'default' id", () => {
        expect(entity).toBeInstanceOf(Entity);
        expect(entity.id).toBe("default");
    });

    it("get connection for github", async () => {
        const app = "github";
        const connection = await entity.getConnection(app);
        expect(connection.appUniqueId).toBe(app);
    });

    it("execute action", async () => {
        const connectedAccount = await entity.getConnection("github");

        expect(connectedAccount).toHaveProperty('id');
        expect(connectedAccount).toHaveProperty('appUniqueId', 'github');
        const actionName = "GITHUB_GITHUB_API_ROOT".toLowerCase();
        const requestBody = {};
      
        const executionResult = await entity.execute(actionName, requestBody, undefined, connectedAccount.id);
        expect(executionResult).toBeDefined();
        // @ts-ignore
        expect(executionResult.execution_details).toHaveProperty('executed', true);
        expect(executionResult.response_data["authorizations_url"]).toBeDefined();
    });

  

    it("get connections", async () => {
        const connections = await entity.getConnections();
        expect(connections.length).toBeGreaterThan(0);
    });

    it("get active triggers", async () => { 
        // const triggers = await entity.getActiveTriggers();
        // expect(triggers.length).toBeGreaterThan(0);
    });

    it("setup trigger", async () => {
        const trigger = await entity.setupTrigger("gmail", "gmail_new_gmail_message", { "userId": "me", "interval": 60, "labelIds": "INBOX" });
  
        triggerId = trigger.triggerId;
        expect(trigger.status).toBe("success");
        expect(trigger.triggerId).toBeDefined();
    });

    it("disable trigger", async () => {
        const trigger = await entity.disableTrigger(triggerId);
        expect(trigger.status).toBe("success");
    });

    it("initiate connection", async () => {
        const connection = await entity.initiateConnection("github");
        expect(connection.connectionStatus).toBe("INITIATED");
    });
    
});
