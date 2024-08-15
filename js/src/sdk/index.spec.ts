import { describe, it, expect } from "@jest/globals";
import {Composio} from "./index"

//@ts-ignore
import { getTestConfig } from "../../config/getTestConfig";

const COMPOSIO_API_KEY = getTestConfig()["COMPOSIO_API_KEY"]
const BACKEND_HERMES_URL = getTestConfig()["BACKEND_HERMES_URL"]

describe("Basic SDK spec suite", () => {
    it("create basic client", () => {
        new Composio(COMPOSIO_API_KEY)
    });

    it("without apiKey, error should be thrown", () => {
        expect(() => {
            new Composio();
        }).toThrow('API Key is required for initializing the client');
    });

    it("get entity and then fetch connection",async()=>{
        const app = "github"
        const composio = new Composio(COMPOSIO_API_KEY, BACKEND_HERMES_URL);
        const entity = composio.getEntity("default")
        
        expect(entity.id).toBe("default")
        const connection = await entity.getConnection(app);
        expect(connection.appUniqueId).toBe(app);
    })
    
});
