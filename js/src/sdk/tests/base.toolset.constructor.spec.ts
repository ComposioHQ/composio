// @ts-ignore - Jest globals are provided by the test environment
import { beforeEach, describe, expect, it } from "@jest/globals";
import { getTestConfig } from "../../../config/getTestConfig";
import { ComposioToolSet } from "../base.toolset";
import {
  fileInputProcessor,
  fileResponseProcessor,
  fileSchemaProcessor,
} from "../utils/processor/file";

describe("ComposioToolSet - Constructor", () => {
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = undefined;
  });

  it("should create instance with valid API key and base URL", async () => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
      entityId: "default",
    });
    
    expect(toolset.apiKey).toBe(testConfig.COMPOSIO_API_KEY);
    expect(toolset.runtime).toBe("composio-ai");
    expect(toolset.entityId).toBe("default");
    expect(toolset.client).toBeDefined();
    
    const tools = await toolset.getToolsSchema({ apps: ["github"] });
    expect(tools).toBeInstanceOf(Array);
    expect(tools).not.toHaveLength(0);
  });

  it("should fall back to environment variable for API key", () => {
    const envApiKey = "test-env-api-key";
    process.env.COMPOSIO_API_KEY = envApiKey;
    
    toolset = new ComposioToolSet();
    expect(toolset.apiKey).toBe(envApiKey);
  });

  it("should use default entityId when not provided", () => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
    });
    expect(toolset.entityId).toBe("default");
  });

  it("should initialize with custom entityId", () => {
    const customEntityId = "custom-entity";
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      entityId: customEntityId,
    });
    expect(toolset.entityId).toBe(customEntityId);
  });

  it("should initialize with different runtime values", () => {
    const customRuntime = "custom-runtime";
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      runtime: customRuntime,
    });
    expect(toolset.runtime).toBe(customRuntime);
  });

  it("should initialize internal processors", () => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
    });
    
    // @ts-expect-error - accessing private property for testing
    expect(toolset.internalProcessors.pre).toContain(fileInputProcessor);
    // @ts-expect-error - accessing private property for testing
    expect(toolset.internalProcessors.post).toContain(fileResponseProcessor);
    // @ts-expect-error - accessing private property for testing
    expect(toolset.internalProcessors.schema).toContain(fileSchemaProcessor);
  });

  it("should throw error when no API key is provided", () => {
    expect(() => new ComposioToolSet()).toThrow();
  });

  it("should initialize all client properties", () => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
    });
    
    expect(toolset.backendClient).toBeDefined();
    expect(toolset.connectedAccounts).toBeDefined();
    expect(toolset.apps).toBeDefined();
    expect(toolset.actions).toBeDefined();
    expect(toolset.triggers).toBeDefined();
    expect(toolset.integrations).toBeDefined();
    expect(toolset.activeTriggers).toBeDefined();
    expect(toolset.userActionRegistry).toBeDefined();
  });
});
