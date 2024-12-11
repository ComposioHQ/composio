import { describe, it, expect, beforeAll } from "@jest/globals";
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
});
