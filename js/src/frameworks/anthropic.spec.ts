import { beforeAll, describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../config/getTestConfig";
import { ActionExecuteResponse } from "../sdk/models/actions";
import { AnthropicToolSet } from "./anthropic";
describe("AnthropicToolSet tests", () => {
  let anthropicToolset: AnthropicToolSet;
  beforeAll(() => {
    anthropicToolset = new AnthropicToolSet({
      apiKey: getTestConfig().COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
  });

  it("should get tools as array", async () => {
    const tools = await anthropicToolset.getTools({
      apps: ["github"],
    });

    expect(tools).toBeInstanceOf(Array);
  });

  it("should get specific tool by action name", async () => {
    const tools = await anthropicToolset.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });

    expect(tools.length).toBe(1);
    expect(tools[0]).toHaveProperty("name");
    expect(tools[0]).toHaveProperty("description");
    expect(tools[0]).toHaveProperty("input_schema");
  });

  it("should get tools with usecase limit", async () => {
    const tools = await anthropicToolset.getTools({
      useCase: "follow user",
      apps: ["github"],
      useCaseLimit: 1,
    });

    expect(tools.length).toBe(1);
  });

  it("check if getTools -> actions are coming", async () => {
    const tools = await anthropicToolset.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });

    expect(Object.keys(tools).length).toBe(1);
  });

  it("should create and execute custom action", async () => {
    await anthropicToolset.createAction({
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
      ): Promise<ActionExecuteResponse> => {
        const res = await executeRequest({
          endpoint: `/user/starred/${inputParams.owner}/${inputParams.repo}`,
          method: "PUT",
          parameters: [],
        });
        return res;
      },
    });

    const tools = await anthropicToolset.getTools({
      actions: ["starRepositoryCustomAction"],
    });
    expect(tools.length).toBe(1);
  });
});
