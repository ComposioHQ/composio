import { beforeAll, describe, expect, it } from "@jest/globals";
import { getTestConfig } from "../../config/getTestConfig";
import { LlamaIndexToolSet } from "./llamaindex";
import { ActionExecuteResponse } from "../sdk/models/actions";
import { z } from "zod";

describe("Apps class tests", () => {
  let langchainToolSet: LlamaIndexToolSet;
  beforeAll(() => {
    langchainToolSet = new LlamaIndexToolSet({
    //   apiKey: getTestConfig().COMPOSIO_API_KEY,
      apiKey: "dbosseffg2hmhuydsm1tej",
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
  });

  it("getools", async () => {
    const tools = await langchainToolSet.getTools({
      apps: ["GITHUB"],
    });
    expect(tools).toBeInstanceOf(Array);
  });
  it("check if tools are coming", async () => {
    const tools = await langchainToolSet.getTools({
      actions: ["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"],
    });
    expect(tools.length).toBe(1);
  });
  it("check if getTools, actions are coming", async () => {
    const tools = await langchainToolSet.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });

    expect(tools.length).toBe(1);
  });
  it("Should create custom action to star a repository", async () => {
    await langchainToolSet.createAction({
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

    const tools = await langchainToolSet.getTools({
      actions: ["starRepositoryCustomAction"],
    });

    await expect(tools.length).toBe(1);
    const actionOuput = await langchainToolSet.executeAction({
      action: "starRepositoryCustomAction",
      params: {
        owner: "composioHQ",
        repo: "composio",
      },
      entityId: "default",
      connectedAccountId: "4364bbb6-3382-4bb6-b4be-e7ff440f90b4",
    });

    expect(actionOuput).toHaveProperty("successful", true);
  });
});
