import { beforeAll, describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { getTestConfig } from "../../config/getTestConfig";
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

  describe("custom actions", () => {
    let customAction: Awaited<ReturnType<typeof vercelAIToolSet.createAction>>;
    let tools: Awaited<ReturnType<typeof vercelAIToolSet.getTools>>;

    beforeAll(async () => {
      const params = z.object({
        owner: z.string().describe("The owner of the repository"),
        repo: z
          .string()
          .describe("The name of the repository without the `.git` extension."),
      });

      customAction = await vercelAIToolSet.createAction({
        actionName: "starRepositoryCustomAction",
        toolName: "github",
        description: "Star A Github Repository For Given `Repo` And `Owner`",
        inputParams: params,
        callback: async (inputParams) => ({
          successful: true,
          data: inputParams,
        }),
      });

      tools = await vercelAIToolSet.getTools({
        actions: ["starRepositoryCustomAction"],
      });
    });

    it("check if custom actions are coming", async () => {
      expect(Object.keys(tools).length).toBe(1);
      expect(tools).toHaveProperty(customAction.name, tools[customAction.name]);
    });

    it("check if custom actions are executing", async () => {
      const res = await vercelAIToolSet.executeAction({
        action: customAction.name,
        params: {
          owner: "composioHQ",
          repo: "composio",
        },
      });
      expect(res.successful).toBe(true);
      expect(res.data).toHaveProperty("owner", "composioHQ");
      expect(res.data).toHaveProperty("repo", "composio");
    });
  });
});
