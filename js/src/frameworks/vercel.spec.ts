import { describe, it, expect, beforeAll } from "@jest/globals";
import { CloudflareToolSet } from "./cloudflare";
import { get } from "http";
import { getTestConfig } from "../../config/getTestConfig";
import { LangchainToolSet } from "./langchain";
import { OpenAIToolSet } from "./openai";
import { VercelAIToolSet } from "./vercel";


describe("Apps class tests", () => {

    let vercelAIToolSet: VercelAIToolSet;
    beforeAll(() => {
        vercelAIToolSet = new VercelAIToolSet({
            apiKey: getTestConfig().COMPOSIO_API_KEY,
            baseUrl: getTestConfig().BACKEND_HERMES_URL
        });
    });

    it("check if tools are coming", async () => {
        const tools = await vercelAIToolSet.get_tools({
            apps: ['github']
        });

        expect(Object.keys(tools)).toBeInstanceOf(Array);

    });

    it("check if actions are coming", async () => {
        const tools = await vercelAIToolSet.get_actions({
            actions: ['GITHUB_GITHUB_API_ROOT']
        });

        expect(Object.keys(tools).length).toBe(1);
    });

});
