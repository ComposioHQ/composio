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

    it("should create a ComposioToolSet instance with apps and tags", async () => {
        const tools = await toolset.getToolsSchema({ apps: ["github"], tags: ["important"] });
        expect(tools).toBeInstanceOf(Array);
        expect(tools).not.toHaveLength(0);
    });

    it("should create a ComposioToolSet instance with actions", async () => {
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

       const executionResult = await toolset.executeAction({
        action: actionName,
        params: requestBody,
        entityId: "default"
       });
       expect(executionResult).toBeDefined();
       // @ts-ignore
       expect(executionResult).toHaveProperty('successfull', true);
       expect(executionResult.data).toBeDefined();

    });


    it("should execute an file upload", async () => {
        const ACTION_NAME = "GMAIL_SEND_EMAIL";
        const actions = await toolset.getToolsSchema({ actions: [ACTION_NAME] });

        // Check if exist
        expect(actions[0].parameters.properties["attachment_file_uri_path"]).toBeDefined();

        const requestBody = {
            recipient_email: "himanshu@composio.dev",
            subject: "Test email from himanshu",
            body: "This is a test email",
            attachment_file_uri_path: "https://composio.dev/wp-content/uploads/2024/07/Composio-Logo.webp"
        };

        const executionResult = await toolset.executeAction({
            action: ACTION_NAME,
            params: requestBody,
            entityId: "default"
        });
        expect(executionResult).toBeDefined();
        // @ts-ignore
        expect(executionResult).toHaveProperty('successfull', true);
        expect(executionResult.data).toBeDefined();

    });

    it("should get tools with usecase limit", async () => {
        const tools = await toolset.getToolsSchema({
            useCase: "follow user",
            apps: ["github"],
            useCaseLimit: 1
        });

        expect(tools.length).toBe(1);
    });

});
