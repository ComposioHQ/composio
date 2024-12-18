import { describe, it, expect, beforeAll } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../config/getTestConfig";
import { LangchainToolSet } from "./langchain";

describe("Apps class tests", () => {
  let langchainToolSet: LangchainToolSet;
  beforeAll(() => {
    langchainToolSet = new LangchainToolSet({
      apiKey: getTestConfig().COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
  });

  it("getools", async () => {
    const tools = await langchainToolSet.getTools({
      apps: ["github"],
    });

    expect(tools).toBeInstanceOf(Array);
  });

  it("check if tools are coming", async () => {
    const tools = await langchainToolSet.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
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
      callback: async (inputParams, authCredentials, executeRequest) => {
        try {
          const res = await executeRequest({
            endpoint: `/user/starred/${inputParams.owner}/${inputParams.repo}`,
            method: "PUT",
            parameters: [],
          });
          return res;
        } catch (e) {
          return {};
        }
      },
    });

    const actionOuput = await langchainToolSet.executeAction({
      action: "starRepositoryCustomAction",
      params: {
        owner: "plxity",
        repo: "achievementsof.life",
      },
      entityId: "default",
      connectedAccountId: "9442cab3-d54f-4903-976c-ee67ef506c9b",
    });

    expect(actionOuput).toHaveProperty("successfull", true);
  });
});
