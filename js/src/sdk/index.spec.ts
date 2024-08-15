import { describe, it, expect } from "@jest/globals";
import { Composio } from "./index";
import { getTestConfig } from "../../config/getTestConfig";

const { COMPOSIO_API_KEY, BACKEND_HERMES_URL } = getTestConfig();

describe("Basic SDK spec suite", () => {
    it("should create a basic client", () => {
        const client = new Composio(COMPOSIO_API_KEY);
        expect(client).toBeInstanceOf(Composio);
    });

    it("should throw an error if apiKey is not provided", () => {
        expect(() => new Composio()).toThrow('API Key is required for initializing the client');
    });

    it("should get an entity and then fetch a connection", async () => {
        const app = "github";
        const composio = new Composio(COMPOSIO_API_KEY, BACKEND_HERMES_URL);
        const entity = composio.getEntity("default");
        
        expect(entity.id).toBe("default");
        
        const connection = await entity.getConnection(app);
        expect(connection.appUniqueId).toBe(app);
    });
});
