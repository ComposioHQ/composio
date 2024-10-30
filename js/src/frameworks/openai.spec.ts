import { describe, it, expect, beforeAll } from "@jest/globals";
import { OpenAIToolSet } from "./openai";
import { getTestConfig } from "../../config/getTestConfig";

describe("Apps class tests", () => {
    let openAIToolset: OpenAIToolSet;

    beforeAll(() => {
        const { COMPOSIO_API_KEY, BACKEND_HERMES_URL } = getTestConfig();
        openAIToolset = new OpenAIToolSet({ apiKey: COMPOSIO_API_KEY, baseUrl: BACKEND_HERMES_URL });
    });

    it("should return an array of tools for 'github' app", async () => {
        const tools = await openAIToolset.getTools({ apps: ['github'] });
        expect(tools).toBeInstanceOf(Array);
    });

    it("should return tools for 'GITHUB_GITHUB_API_ROOT' action", async () => {
        const tools = await openAIToolset.getTools({ actions: ['GITHUB_GITHUB_API_ROOT'] });
        expect(Object.keys(tools)).toHaveLength(1);
    });

    it("should check if actions are coming from getTools", async () => {
        const tools = await openAIToolset.getTools({ actions: ['GITHUB_GITHUB_API_ROOT'] });
        expect(Object.keys(tools)).toHaveLength(1);
    });
});
