import { describe, it, expect, beforeAll } from "@jest/globals";
import { CloudflareToolSet } from "./cloudflare";
import { get } from "http";
import { getTestConfig } from "../../config/getTestConfig";
import { LangchainToolSet } from "./langchain";
import { OpenAIToolSet } from "./openai";


describe("Apps class tests", () => {

    let openAIToolset: OpenAIToolSet;
    beforeAll(() => {
        openAIToolset = new OpenAIToolSet({
            apiKey: getTestConfig().COMPOSIO_API_KEY,
            baseUrl: getTestConfig().BACKEND_HERMES_URL
        });
    });

    it("get tools", async () => {
        const tools = await openAIToolset.getTools({
            apps: ['github']
        });

        expect(tools).toBeInstanceOf(Array);

    });

    it("check if tools are coming", async () => {
        const tools = await openAIToolset.get_actions({
            actions: ['GITHUB_GITHUB_API_ROOT']
        });

        expect(Object.keys(tools).length).toBe(1);
    });

});
