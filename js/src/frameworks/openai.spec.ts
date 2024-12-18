import { beforeAll, describe, expect, it } from "@jest/globals";
import { getTestConfig } from "../../config/getTestConfig";
import { OpenAIToolSet } from "./openai";

describe("Apps class tests", () => {
  let openAIToolset: OpenAIToolSet;
  beforeAll(() => {
    openAIToolset = new OpenAIToolSet({
      apiKey: getTestConfig().COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
  });

  it("get tools", async () => {
    const tools = await openAIToolset.getTools({
      apps: ["github"],
    });

    expect(tools).toBeInstanceOf(Array);
  });

  it("check if tools are coming", async () => {
    const tools = await openAIToolset.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });

    expect(Object.keys(tools).length).toBe(1);
  });

  it("should get tools with usecase limit", async () => {
    const tools = await openAIToolset.getTools({
      useCase: "follow user",
      apps: ["github"],
      useCaseLimit: 1,
    });

    expect(tools.length).toBe(1);
  });

  it("check if getTools -> actions are coming", async () => {
    const tools = await openAIToolset.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });

    expect(Object.keys(tools).length).toBe(1);
  });
});
