import { beforeAll, describe, expect, it } from "@jest/globals";
import { getTestConfig } from "../../config/getTestConfig";
import { TSchemaProcessor } from "../types/base_toolset";
import { ComposioToolSet } from "./base.toolset";
import { ActionExecutionResDto } from "./client";

describe("ComposioToolSet class tests", () => {
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeAll(() => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
      entityId: "default",
    });
  });

  it("should create a ComposioToolSet instance", async () => {
    const tools = await toolset.getToolsSchema({ apps: ["github"] });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).not.toHaveLength(0);
  });

  it("should create a ComposioToolSet instance with apps and tags", async () => {
    const tools = await toolset.getToolsSchema({
      apps: ["github"],
      tags: ["important"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).not.toHaveLength(0);
  });

  it("should create a ComposioToolSet instance with actions", async () => {
    const tools = await toolset.getActionsSchema({
      actions: ["github_issues_create"],
    });
    expect(tools).toBeInstanceOf(Array);
  });

  it("should have schema processor", async () => {
    const addSchemaProcessor: TSchemaProcessor = ({
      actionName: _actionName,
      toolSchema,
    }) => {
      return {
        ...toolSchema,
        parameters: {
          ...toolSchema.parameters,
          description: "hello",
        },
      };
    };

    toolset.addSchemaProcessor(addSchemaProcessor);
    await toolset.getToolsSchema({
      actions: ["github_issues_create"],
    });
  });

  it("should execute an action", async () => {
    const actionName = "github_issues_create";
    const requestBody = {
      owner: "utkarsh-dixit",
      repo: "speedy",
      title: "Test issue",
      body: "This is a test issue",
      appNames: "github",
    };

    const executionResult = await toolset.executeAction({
      action: actionName,
      params: requestBody,
      entityId: "default",
    });
    expect(executionResult).toBeDefined();
    // @ts-ignore
    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult.data).toBeDefined();
  });

  it("should execute an action with pre processor", async () => {
    const actionName = "github_issues_create";
    const requestBody = {
      owner: "utkarsh-dixit",
      repo: "speedy",
      title: "Test issue",
      body: "This is a test issue",
      appNames: "github",
    };

    const preProcessor = ({
      params,
    }: {
      params: Record<string, unknown>;
      actionName: string;
    }) => {
      return {
        ...params,
        owner: "utkarsh-dixit",
        repo: "speedy",
        title: "Test issue2",
      };
    };

    const postProcessor = ({
      actionName: _actionName,
      toolResponse,
    }: {
      actionName: string;
      toolResponse: ActionExecutionResDto;
    }) => {
      return {
        data: {
          ...toolResponse.data,
          isPostProcessed: true,
        },
        error: toolResponse.error,
        successful: toolResponse.successful,
        successfull: toolResponse.successfull,
      };
    };

    toolset.addPreProcessor(preProcessor);
    toolset.addPostProcessor(postProcessor);

    const executionResult = await toolset.executeAction({
      action: actionName,
      params: requestBody,
      entityId: "default",
    });

    expect(executionResult).toBeDefined();
    // @ts-ignore
    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult.data).toBeDefined();

    const executionResultData = executionResult.data as Record<string, unknown>;
    expect(executionResultData.title).toBe("Test issue2");
    expect(executionResultData.isPostProcessed).toBe(true);

    // Remove pre processor and post processor
    toolset.removePreProcessor();

    const executionResultAfterRemove = (await toolset.executeAction({
      action: actionName,
      params: requestBody,
      entityId: "default",
    })) as ActionExecutionResDto;

    expect(executionResultAfterRemove).toBeDefined();
    // @ts-ignore
    expect(executionResultAfterRemove).toHaveProperty("successfull", true);
    expect(executionResultAfterRemove.data).toBeDefined();
    expect(executionResultAfterRemove.data.title).toBe("Test issue");
  });

  it("should execute an file upload", async () => {
    const ACTION_NAME = "GMAIL_SEND_EMAIL";
    const actions = await toolset.getToolsSchema({ actions: [ACTION_NAME] });

    const firstAction = actions[0]!;
    // Check if exist
    expect(
      firstAction.parameters.properties["attachment_schema_parsed_file"]
    ).toBeDefined();

    const requestBody = {
      recipient_email: "himanshu@composio.dev",
      subject: "Test email from himanshu",
      body: "This is a test email",
      attachment_schema_parsed_file:
        "https://composio.dev/wp-content/uploads/2024/07/Composio-Logo.webp",
    };

    const executionResult = await toolset.executeAction({
      action: ACTION_NAME,
      params: requestBody,
      entityId: "default",
    });
    expect(executionResult).toBeDefined();
    // @ts-ignore
    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult.data).toBeDefined();
  });

  it.skip("should execute downloadable file action", async () => {
    const ACTION_NAME = "GOOGLEDRIVE_DOWNLOAD_FILE";
    const executionResult = await toolset.executeAction({
      action: ACTION_NAME,
      params: {
        file_id: testConfig.drive.downloadable_file_id,
      },
      entityId: "default",
    });

    const fileData = executionResult.data.file as {
      uri: string;
      s3url: string;
    };

    expect(fileData.uri.length).toBeGreaterThan(0);
    expect(fileData.s3url.length).toBeGreaterThan(0);
  });

  it("should get tools with usecase limit", async () => {
    const tools = await toolset.getToolsSchema({
      useCase: "follow user",
      apps: ["github"],
      useCaseLimit: 1,
    });

    expect(tools.length).toBe(1);
  });
});
