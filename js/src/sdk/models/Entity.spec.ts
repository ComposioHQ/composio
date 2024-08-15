import { describe, it, expect } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendInstance";
import { Entity } from "./Entity";

describe("Entity class tests", () => {
    let backendClient = getBackendClient();
    let entity: Entity;

    beforeAll(() => {
        entity = new Entity(backendClient, "default");
    });

    it("should create an Entity instance with 'default' id", () => {
        expect(entity).toBeInstanceOf(Entity);
        expect(entity.id).toBe("default");
    });

    it("get connection", async () => {
        const app = "github";
        const connection = await entity.getConnection(app);
        expect(connection.appUniqueId).toBe(app);
    });

    it("get connections", async () => {
        const connections = await entity.getConnections();
        expect(connections.length).toBeGreaterThan(0);
    });

    it("get active triggers", async () => { 
        const triggers = await entity.getActiveTriggers();
        expect(triggers.length).toBeGreaterThan(0);
    });

    // it("setup trigger", async () => {
    //     const trigger = await entity.setupTrigger("github", "test", {});
    //     expect(trigger.status).toBe("success");
    // });

    // it("disable trigger", async () => {
    //     const trigger = await entity.disableTrigger("test");
    //     expect(trigger.status).toBe("success");
    // });

    // it("initiate connection", async () => {
    //     const connection = await entity.initiateConnection("github");
    //     expect(connection.connectionStatus).toBe("INITIATED");
    // });
});
