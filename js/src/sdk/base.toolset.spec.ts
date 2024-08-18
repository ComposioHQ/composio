import { describe, it, expect, beforeAll } from "@jest/globals";
import { ComposioToolSet } from "./base.toolset";
import { getTestConfig } from "../../config/getTestConfig";

describe("ComposioToolSet class tests", () => {
    let toolset: ComposioToolSet;
    const testConfig = getTestConfig();

    beforeAll(() => {
        toolset = new ComposioToolSet(testConfig.COMPOSIO_API_KEY, testConfig.BACKEND_HERMES_URL);
    });

    it("should create a ComposioToolSet instance", async() => {
       const tools =  await toolset.getToolsSchema({ apps: ["github"] });
       expect(tools).toBeInstanceOf(Array);
       expect(tools).not.toHaveLength(0);
    });

    it("should create a ComposioToolSet instance", async () => {
        const tools = await toolset.getToolsSchema({ apps: ["github"], tags: ["important"] });
        expect(tools).toBeInstanceOf(Array);
        expect(tools).not.toHaveLength(0);
    });

    it("should create a ComposioToolSet instance", async () => {
        const tools = await toolset.getActionsSchema({ actions: ["github_issues_create"] });
        expect(tools).toBeInstanceOf(Array);
    });

    it("should execute an action", async () => {
   
       const actionName = "github_issues_create";
       const requestBody = {
            owner: "utkarsh-dixit",
            repo: "speedy",
            title: "Test issue",
            body: "This is a test issue",
            appNames: "github"
       };

       const executionResult = await toolset.executeAction(actionName, requestBody, "default");
       expect(executionResult).toBeDefined();
       // @ts-ignore
       expect(executionResult.execution_details).toHaveProperty('executed', true);
       expect(executionResult.response_data).toBeDefined();

    });

    // it("should have a valid API key", () => {
    //     expect(toolset.apiKey).toBe(testConfig.COMPOSIO_API_KEY);
    // });

    // it("should have a valid backend URL", () => {
    //     expect(toolset.client.baseUrl).toBe(testConfig.BACKEND_HERMES_URL);
    // });

    // Additional tests for ComposioToolSet methods can be added here
});
