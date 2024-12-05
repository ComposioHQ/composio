import { describe, it, expect, beforeAll } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../config/getTestConfig";
import { LanggraphToolSet } from "./langgraph";


// Langgraph extens langchain class, all the properties are same
describe("Apps class tests", () => {
    it("getools", async () => {
        let langgraphToolSet = new LanggraphToolSet({
            apiKey: getTestConfig().COMPOSIO_API_KEY,
            baseUrl: getTestConfig().BACKEND_HERMES_URL,
        });
        const tools = await langgraphToolSet.getTools({
            apps: ["github"],
        });
        expect(tools).toBeInstanceOf(Array);
    });
})