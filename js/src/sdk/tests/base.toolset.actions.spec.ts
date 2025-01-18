// @ts-ignore - Jest globals are provided by the test environment
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getTestConfig } from "../../../config/getTestConfig";
import { ComposioToolSet } from "../base.toolset";

describe("ComposioToolSet - Actions Schema", () => {
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeEach(() => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
    });
  });

  it("should get actions with valid action names", async () => {
    const tools = await toolset.getActionsSchema({
      actions: ["github_issues_create"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0].name).toBe("github_issues_create");
  });

  it("should handle empty filters", async () => {
    const tools = await toolset.getActionsSchema();
    expect(tools).toBeInstanceOf(Array);
  });

  it("should handle non-existent action names", async () => {
    const tools = await toolset.getActionsSchema({
      actions: ["non_existent_action"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).toHaveLength(0);
  });

  it("should handle mixed valid/invalid action names", async () => {
    const tools = await toolset.getActionsSchema({
      actions: ["github_issues_create", "non_existent_action"],
    });
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("github_issues_create");
  });

  it("should get actions with custom entity ID", async () => {
    const customEntityId = "custom-entity";
    const tools = await toolset.getActionsSchema({
      actions: ["github_issues_create"],
    }, customEntityId);
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("should handle API errors gracefully", async () => {
    const invalidToolset = new ComposioToolSet({
      apiKey: "invalid-api-key",
      baseUrl: testConfig.BACKEND_HERMES_URL,
    });

    await expect(invalidToolset.getActionsSchema({
      actions: ["github_issues_create"],
    })).rejects.toThrow();
  });

  it("should pass filters correctly to getToolsSchema", async () => {
    const spy = jest.spyOn(toolset, 'getToolsSchema');
    const actions = ["github_issues_create"];
    
    await toolset.getActionsSchema({ actions });
    
    expect(spy).toHaveBeenCalledWith({ actions }, undefined);
    spy.mockRestore();
  });

  it("should handle undefined filters", async () => {
    const tools = await toolset.getActionsSchema(undefined);
    expect(tools).toBeInstanceOf(Array);
  });

  it("should handle null filters", async () => {
    // @ts-ignore - Testing invalid input
    const tools = await toolset.getActionsSchema(null);
    expect(tools).toBeInstanceOf(Array);
  });
});
