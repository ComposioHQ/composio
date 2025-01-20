import { beforeAll, describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../config/getTestConfig";
import { TSchemaProcessor } from "../types/base_toolset";
import { ComposioToolSet } from "./base.toolset";
import { ActionExecutionResDto } from "./client";

// eslint-disable-next-line max-lines-per-function
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

  const createdConnectionIds: string[] = [];
  const createdIntegrationIds: string[] = [];

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

  // it("should execute an file upload", async () => {
  //   const ACTION_NAME = "GMAIL_SEND_EMAIL";
  //   const imageResponse = await fetch(
  //     "https://composio.dev/wp-content/uploads/2024/07/Composio-Logo.webp"
  //   );
  //   const arrayBuffer = await imageResponse.arrayBuffer();
  //   const base64Image = Buffer.from(arrayBuffer).toString("base64");

  //   const requestBody = {
  //     recipient_email: "abhishek@composio.dev",
  //     subject: "Test email from himanshu",
  //     body: "This is a test email",
  //     is_html: false,
  //     attachment: {
  //       name: "composio-Logo.webp",
  //       content: base64Image,
  //     },
  //   };

  //   const executionResult = await toolset.executeAction({
  //     action: ACTION_NAME,
  //     params: requestBody,
  //     entityId: "default",
  //   });
  //   expect(executionResult).toBeDefined();
  //   // @ts-ignore
  //   expect(executionResult).toHaveProperty("successfull", true);
  //   expect(executionResult.data).toBeDefined();
  // });

  it("should execute an file upload", async () => {
    const ACTION_NAME = "GMAIL_SEND_EMAIL";
    const actions = await toolset.getToolsSchema({ actions: [ACTION_NAME] });

    // Check if exist
    expect(
      actions[0]!.parameters.properties["attachment_file_uri_path"]
    ).toBeDefined();

    const requestBody = {
      recipient_email: "abhishek@composio.dev",
      subject: "Test email from himanshu",
      body: "This is a test email",
      attachment_file_uri_path:
        // "https://composio.dev/wp-content/uploads/2024/07/Composio-Logo.webp",
        "/Users/abhishek/Desktop/randomimage.png",
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

  it("should get tools with usecase limit", async () => {
    const tools = await toolset.getToolsSchema({
      useCase: "follow user",
      apps: ["github"],
      useCaseLimit: 1,
    });

    expect(tools.length).toBe(1);
  });

  // Custom action tests
  it("Should create custom action to star a repository", async () => {
    await toolset.createAction({
      actionName: "starRepositoryCustomAction",
      toolName: "github",
      description: "This action stars a repository",
      inputParams: z.object({
        owner: z.string(),
        repo: z.string(),
      }),
      callback: async (
        inputParams,
        _authCredentials,
        executeRequest
      ): Promise<ActionExecutionResDto> => {
        const res = await executeRequest({
          endpoint: `/user/starred/${inputParams.owner}/${inputParams.repo}`,
          method: "PUT",
          parameters: [],
        });
        return res;
      },
    });

    const tools = await toolset.getToolsSchema({
      actions: ["starRepositoryCustomAction"],
    });

    await expect(tools.length).toBe(1);

    const connectedAccount = await toolset.connectedAccounts.list({
      appNames: "github",
      showActiveOnly: true,
    });

    const actionOuput = await toolset.executeAction({
      action: "starRepositoryCustomAction",
      params: {
        owner: "plxity",
        repo: "achievementsof.life",
      },
      entityId: "default",
      connectedAccountId: connectedAccount.items[0].id,
    });

    expect(actionOuput).toHaveProperty("successful", true);
  });

  // Connected accounts tests
  let createdConnectionId: string;

  it("Should initiate a connection", async () => {
    const connectionRequest = await toolset.connectedAccounts.initiate({
      appName: "github",
    });
    const connection = await toolset.connectedAccounts.get({
      connectedAccountId: connectionRequest.connectedAccountId,
    });
    if (connection.integrationId) {
      createdIntegrationIds.push(connection.integrationId);
    }
    createdConnectionId = connectionRequest.connectedAccountId;
    createdConnectionIds.push(connectionRequest.connectedAccountId);
    expect(connectionRequest.connectionStatus).toBe("INITIATED");
    expect(connectionRequest.connectedAccountId).toBeTruthy();
    expect(connectionRequest.redirectUrl).toBeTruthy();
  });

  it("Should disable connection", async () => {
    const status = await toolset.connectedAccounts.disable({
      connectedAccountId: createdConnectionId,
    });
    expect(status.status).toBe("success");
    expect(status.connectedAccountId).toBe(createdConnectionId);

    const connectionData = await toolset.connectedAccounts.get({
      connectedAccountId: createdConnectionId,
    });
    expect(connectionData.enabled).toBe(false);
  });

  it("Should enable connection", async () => {
    const status = await toolset.connectedAccounts.enable({
      connectedAccountId: createdConnectionId,
    });
    expect(status.status).toBe("success");
    expect(status.connectedAccountId).toBe(createdConnectionId);

    const connectionData = await toolset.connectedAccounts.get({
      connectedAccountId: createdConnectionId,
    });
    expect(connectionData.enabled).toBe(true);
  });

  it("Should get connection details", async () => {
    const connection = await toolset.connectedAccounts.get({
      connectedAccountId: createdConnectionId,
    });
    expect(connection.id).toBe(createdConnectionId);
  });

  it("Should list all connections", async () => {
    const connections = await toolset.connectedAccounts.list({
      appNames: "GITHUB",
    });
    expect(connections.items.length).toBeGreaterThan(0);
  });

  it("Should delete the connection", async () => {
    const response = await toolset.connectedAccounts.delete({
      connectedAccountId: createdConnectionId,
    });
    expect(response).toEqual({ status: "success", count: 1 });
  });

  it("should throw error if connected account id is invalid in get method", async () => {
    await expect(
      toolset.connectedAccounts.get({
        connectedAccountId: "invalid-id",
      })
    ).rejects.toThrow();
  });

  // Integration tests
  let createdIntegrationId: string;

  it("should create an integration", async () => {
    const integration = await toolset.integrations.create({
      name: "testIntegration",
      authScheme: "OAUTH2",
      appUniqueKey: "github",
      useComposioAuth: true,
    });
    createdIntegrationId = integration.id!;
    createdIntegrationIds.push(integration.id!);
    expect("github").toBe(integration.appName);
  });

  it("should get an integration", async () => {
    const integration = await toolset.integrations.get({
      integrationId: createdIntegrationId,
    });
    expect(integration.id).toBe(createdIntegrationId);
  });

  it("should list all integrations", async () => {
    const integrations = await toolset.integrations.list({ appName: "GITHUB" });
    expect(integrations.items.length).toBeGreaterThan(0);
  });

  // Trigger tests
  let createdTriggerId: string;

  it("should get trigger config", async () => {
    const triggerConfig = await toolset.triggers.get({
      triggerId: "GITHUB_STAR_ADDED_EVENT",
    });
    expect(triggerConfig.config.properties).toBeTruthy();
  });

  it("should throw error when invalid trigger id is passed", async () => {
    await expect(
      toolset.triggers.get({
        triggerId: "invalid-trigger-id",
      })
    ).rejects.toThrow();
  });

  it("should setup a trigger", async () => {
    const connectedAccounts = await toolset.connectedAccounts.list({
      appNames: "github",
      showActiveOnly: true,
    });
    const trigger = await toolset.triggers.setup({
      connectedAccountId: connectedAccounts.items[0].id,
      triggerName: "GITHUB_STAR_ADDED_EVENT",
      config: {
        owner: "plxity",
        repo: "achievementsof.life",
      },
    });
    createdTriggerId = trigger.triggerId;
    expect(trigger.status).toBe("success");
  });

  it("should disable a trigger", async () => {
    const trigger = await toolset.triggers.disable({
      triggerId: createdTriggerId,
    });
    expect(trigger.status).toBe("success");
  });

  afterAll(async () => {
    const integrationIdsToDelete = new Set<string>();
    for (const connectionId of createdConnectionIds) {
      try {
        // First check if the connection exists
        try {
          const connection = await toolset.connectedAccounts.get({
            connectedAccountId: connectionId,
          });
          // If connection exists, proceed with deletion
          if (connection.integrationId) {
            integrationIdsToDelete.add(connection.integrationId);
          }
          await toolset.connectedAccounts.delete({
            connectedAccountId: connectionId,
          });
        } catch (_) {}
      } catch (error) {
        throw error;
      }
    }
    createdIntegrationIds.forEach((id) => integrationIdsToDelete.add(id));
    for (const integrationId of integrationIdsToDelete) {
      try {
        await toolset.integrations.delete({ integrationId: integrationId });
      } catch (error) {
        throw error;
      }
    }
  });
});
