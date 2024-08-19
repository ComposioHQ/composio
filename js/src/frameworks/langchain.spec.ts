import { describe, it, expect, beforeAll } from "@jest/globals";
import { CloudflareToolSet } from "./cloudflare";
import { get } from "http";
import { getTestConfig } from "../../config/getTestConfig";
import { LangchainToolSet } from "./langchain";


describe("Apps class tests", () => {

    let langchainToolSet: LangchainToolSet;
    beforeAll(() => {
        langchainToolSet = new LangchainToolSet({
            apiKey: getTestConfig().COMPOSIO_API_KEY,
            baseUrl: getTestConfig().BACKEND_HERMES_URL
        });
    });

    it("getools",async() => {
        const tools = await langchainToolSet.getTools({
            apps: ['github']
        });

        expect(tools).toBeInstanceOf(Array);

    });

    it("check if tools are coming", async () => {
        const tools = await langchainToolSet.getActions({
            actions: ['GITHUB_GITHUB_API_ROOT']
        });

        expect(tools.length).toBe(1);
    });

});
