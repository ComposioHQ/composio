import { beforeAll, describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../config/getTestConfig";
import { ActionExecuteResponse } from "../sdk/models/actions";
import { VercelAIToolSet } from "./vercel";

describe("Apps class tests", () => {
  let vercelAIToolSet: VercelAIToolSet;
  beforeAll(() => {
    vercelAIToolSet = new VercelAIToolSet({
      apiKey: getTestConfig().COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
  });

  it("check if tools are coming", async () => {
    const tools = await vercelAIToolSet.getTools({
      apps: ["github"],
    });

    expect(Object.keys(tools)).toBeInstanceOf(Array);
  });

  it("check if actions are coming", async () => {
    const tools = await vercelAIToolSet.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });
    expect(Object.keys(tools).length).toBe(1);
  });

  it("Should create custom action to star a repository", async () => {
    await vercelAIToolSet.createAction({
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

    const tools = await vercelAIToolSet.getTools({
      actions: ["starRepositoryCustomAction"],
    });

    await expect(Object.keys(tools).length).toBe(1);
  });
});
