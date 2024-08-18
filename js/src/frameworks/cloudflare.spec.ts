import { describe, it, expect, beforeAll } from "@jest/globals";
import { CloudflareToolSet } from "./cloudflare";
import { get } from "http";
import { getTestConfig } from "../../config/getTestConfig";


describe("Apps class tests", () => {

    let cloudflareToolSet: CloudflareToolSet;
    beforeAll(() => {
        cloudflareToolSet = new CloudflareToolSet({
            apiKey: getTestConfig().COMPOSIO_API_KEY,
            baseUrl: getTestConfig().BACKEND_HERMES_URL
        });
    });

    it("check if tools are coming", async () => {
        const tools = await cloudflareToolSet.getActions({
            actions: ['GITHUB_GITHUB_API_ROOT']
        });

        expect(tools.length).toBe(1);
    });

});
