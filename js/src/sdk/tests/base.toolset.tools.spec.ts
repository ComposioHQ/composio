// @ts-ignore - Jest globals are provided by the test environment
import { beforeEach, describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../../config/getTestConfig";
import { RawActionData, TSchemaProcessor } from "../../types/base_toolset";
import { ActionProxyRequestConfigDTO } from "../client/types.gen";
import { ComposioToolSet } from "../base.toolset";
import { ActionExecutionResDto } from "../client";

describe("ComposioToolSet - Tools Schema", () => {
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeEach(() => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
    });
  });

  it("should get tools with valid app names", async () => {
    const tools = await toolset.getToolsSchema({
      apps: ["github"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).not.toHaveLength(0);
    expect(tools[0].appName).toBe("github");
  });

  it("should get tools with valid tags", async () => {
    const tools = await toolset.getToolsSchema({
      apps: ["github"],
      tags: ["important"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).not.toHaveLength(0);
    expect(tools[0].tags).toContain("important");
  });

  it("should get tools with useCase and useCaseLimit", async () => {
    const tools = await toolset.getToolsSchema({
      useCase: "follow user",
      apps: ["github"],
      useCaseLimit: 1,
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].appName).toBe("github");
  });

  it("should handle filterByAvailableApps", async () => {
    const tools = await toolset.getToolsSchema({
      apps: ["github"],
      filterByAvailableApps: true,
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools.every(tool => tool.appName === "github")).toBe(true);
  });

  it("should handle invalid filter combinations", async () => {
    const tools = await toolset.getToolsSchema({
      apps: ["nonexistent_app"],
      tags: ["nonexistent_tag"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).toHaveLength(0);
  });

  it("should handle empty response", async () => {
    const tools = await toolset.getToolsSchema({
      actions: ["nonexistent_action"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).toHaveLength(0);
  });

  it("should process schema with custom processor", async () => {
    const customDescription = "Custom processed description";
    const addSchemaProcessor: TSchemaProcessor = ({
      actionName: _actionName,
      toolSchema,
    }) => {
      return {
        ...toolSchema,
        parameters: {
          ...toolSchema.parameters,
          description: customDescription,
        },
      };
    };

    await toolset.addSchemaProcessor(addSchemaProcessor);
    const tools = await toolset.getToolsSchema({
      actions: ["github_issues_create"],
    });
    
    expect(tools[0].parameters.description).toBe(customDescription);
    await toolset.removeSchemaProcessor();
  });

  it("should handle API errors gracefully", async () => {
    const invalidToolset = new ComposioToolSet({
      apiKey: "invalid-api-key",
      baseUrl: testConfig.BACKEND_HERMES_URL,
    });

    await expect(invalidToolset.getToolsSchema({
      apps: ["github"],
    })).rejects.toThrow();
  });

  it("should handle custom actions in results", async () => {
    const customAction = {
      name: "custom_action",
      description: "Custom action for testing",
      parameters: {},
    };

    await toolset.createAction({
      actionName: customAction.name,
      description: customAction.description,
      inputParams: z.object({}),
      callback: async (
        _params: Record<string, string>,
        _auth: Record<string, string> | undefined,
        _executeRequest: (data: ActionProxyRequestConfigDTO) => Promise<ActionExecutionResDto>
      ) => {
        return { data: {}, successful: true };
      },
    });

    const tools = await toolset.getToolsSchema({
      actions: ["custom_action"],
      tags: ["custom"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).not.toHaveLength(0);
    expect(tools[0].name).toBe("custom_action");

    // Clean up by creating a new instance without the custom action
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
    });
  });

  it("should handle schema processor chain", async () => {
    const processor1 = jest.fn(({ toolSchema }: { toolSchema: RawActionData }) => ({
      ...toolSchema,
      description: "processed1",
    }));
    const processor2 = jest.fn(({ toolSchema }: { toolSchema: RawActionData }) => ({
      ...toolSchema,
      description: "processed2",
    }));

    await toolset.addSchemaProcessor(processor1);
    const tools1 = await toolset.getToolsSchema({ apps: ["github"] });
    expect(processor1).toHaveBeenCalled();
    expect(tools1[0].description).toBe("processed1");

    await toolset.removeSchemaProcessor();
    await toolset.addSchemaProcessor(processor2);
    const tools2 = await toolset.getToolsSchema({ apps: ["github"] });
    expect(processor2).toHaveBeenCalled();
    expect(tools2[0].description).toBe("processed2");
  });
});
