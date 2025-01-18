/**
 * @fileoverview This file has been split into smaller test modules in the tests directory.
 * The tests have been moved to:
 * - tests/base.toolset.constructor.spec.ts: Constructor and initialization tests
 * - tests/base.toolset.tools.spec.ts: Tools schema and filtering tests
 * - tests/base.toolset.actions.spec.ts: Action management and execution tests
 * - tests/base.toolset.processors.spec.ts: Processor chain and management tests
 */

import { describe, it, expect } from '@jest/globals';
import { ComposioToolSet } from './base.toolset';

/**
 * @deprecated This file is kept as a placeholder to maintain Git history.
 * All tests have been moved to separate files in the tests directory.
 */
describe('ComposioToolSet', () => {
  it('should be properly initialized', () => {
    const _toolset = new ComposioToolSet({ apiKey: 'test' });
    expect(_toolset).toBeInstanceOf(ComposioToolSet);
  });
});
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeEach(() => {
    // Reset environment variables before each test
    process.env.COMPOSIO_API_KEY = undefined;
  });

  afterEach(() => {
    // Clean up environment variables after each test
    process.env.COMPOSIO_API_KEY = undefined;
  });

  // Constructor Tests
  describe('Constructor', () => {
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
      
      // @ts-ignore - accessing private property for testing
      expect(toolset.internalProcessors.pre).toContain(fileInputProcessor);
      // @ts-ignore - accessing private property for testing
      expect(toolset.internalProcessors.post).toContain(fileResponseProcessor);
      // @ts-ignore - accessing private property for testing
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

  // Tools Schema Tests
  describe('Tools Schema', () => {
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

    it("should validate filter inputs", async () => {
      await expect(toolset.getToolsSchema({
        apps: ["invalid-apps-format"],
      })).rejects.toThrow();

      await expect(toolset.getToolsSchema({
        tags: ["123"],
      })).rejects.toThrow();
    });

    it("should handle multiple filter types simultaneously", async () => {
      const tools = await toolset.getToolsSchema({
        apps: ["github"],
        tags: ["important"],
        actions: ["github_issues_create"],
        useCase: "create issue",
      });
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].appName).toBe("github");
      expect(tools[0].name).toBe("github_issues_create");
    });

    it("should handle undefined and null filters", async () => {
      const tools1 = await toolset.getToolsSchema({});
      expect(tools1).toBeInstanceOf(Array);

      const tools2 = await toolset.getToolsSchema({});
      expect(tools2).toBeInstanceOf(Array);
    });

    it("should handle custom actions in results", async () => {
      const customAction = {
        name: "custom_action",
        description: "Custom action for testing",
        parameters: {},
      };
      // Create a custom action with proper types
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

      // Clean up custom action
      // Clean up by creating a new instance without the custom action
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should handle empty filter objects", async () => {
      const tools = await toolset.getToolsSchema({});
      expect(tools).toBeInstanceOf(Array);
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

  // Actions Schema Tests
  describe('Actions Schema', () => {
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
      // Create a new instance with invalid API key
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

  describe('createAction', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should create action with valid parameters", async () => {
      const actionName = "test_action";
      const description = "Test action description";
      const inputParams = z.object({
        param1: z.string(),
        param2: z.string().optional(),
      });

      const action = await toolset.createAction({
        actionName,
        description,
        inputParams,
        callback: async (params) => ({
          data: { received: params },
          successful: true,
        }),
      });

      expect(action).toBeDefined();
      expect(action.name).toBe(actionName);
      expect(action.description).toBe(description);
      expect(action.parameters).toBeDefined();
      expect(action.parameters.properties).toBeDefined();
    });

    it("should throw error when creating action without required fields", async () => {
      await expect(toolset.createAction({
        // Missing actionName
        callback: async () => ({ data: {}, successful: true }),
      })).rejects.toThrow("You must provide actionName for this action");
    });

    it("should throw error when creating action with invalid callback", async () => {
      await expect(toolset.createAction({
        actionName: "invalid_callback_action",
        // @ts-ignore - Testing invalid input
        callback: "not a function",
      })).rejects.toThrow("Callback must be a function");
    });

    it("should create action with complex parameter types", async () => {
      const actionName = "complex_params_action";
      const inputParams = z.object({
        stringParam: z.string(),
        numberParam: z.number().optional(),
        arrayParam: z.array(z.string()),
        objectParam: z.object({
          nested: z.string(),
        }),
      });

      const action = await toolset.createAction({
        actionName,
        inputParams,
        callback: async () => ({ data: {}, successful: true }),
      });

      expect(action.parameters.properties).toHaveProperty("stringParam");
      expect(action.parameters.properties).toHaveProperty("numberParam");
      expect(action.parameters.properties).toHaveProperty("arrayParam");
      expect(action.parameters.properties).toHaveProperty("objectParam");
    });

    it("should handle duplicate action creation", async () => {
      const actionName = "duplicate_action";
      
      // Create first action
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      // Create duplicate action
      const duplicateAction = await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      // Should overwrite the previous action
      expect(duplicateAction.name).toBe(actionName);
    });

    it("should create action with schema processor integration", async () => {
      const actionName = "processor_integrated_action";
      const customDescription = "Processed description";
      
      const processor: TSchemaProcessor = ({ toolSchema }: { toolSchema: RawActionData }): RawActionData => ({
        ...toolSchema,
        description: customDescription,
      });

      await toolset.addSchemaProcessor(processor);

      const action = await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      expect(action.description).toBe(customDescription);
      await toolset.removeSchemaProcessor();
    });

    it("should verify action registration in registry", async () => {
      const actionName = "registry_test_action";
      
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      const tools = await toolset.getToolsSchema({
        actions: [actionName],
      });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(actionName);
    });

    it("should execute created action successfully", async () => {
      const actionName = "executable_action";
      const testParam = "test value";

      await toolset.createAction({
        actionName,
        inputParams: z.object({
          testParam: z.string(),
        }),
        callback: async (params) => ({
          data: { received: params.testParam },
          successful: true,
        }),
      });

      const result = await toolset.executeAction({
        action: actionName,
        params: { testParam },
        entityId: "default",
      });

      expect(result.successful).toBe(true);
      expect(result.data.received).toBe(testParam);
    });
  });

  describe('isCustomAction', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should return true for existing custom action", async () => {
      const actionName = "custom_test_action";
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      // @ts-ignore - accessing private method for testing
      const isCustom = await toolset.isCustomAction(actionName);
      expect(isCustom).toBe(true);
    });

    it("should return false for non-existent action", async () => {
      // @ts-ignore - accessing private method for testing
      const isCustom = await toolset.isCustomAction("non_existent_action");
      expect(isCustom).toBe(false);
    });

    it("should return false for built-in action", async () => {
      // @ts-ignore - accessing private method for testing
      const isCustom = await toolset.isCustomAction("github_issues_create");
      expect(isCustom).toBe(false);
    });

    it("should handle case-insensitive action names", async () => {
      const actionName = "CaSeSeNsItIvE_AcTiOn";
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      // @ts-ignore - accessing private method for testing
      const isCustom = await toolset.isCustomAction(actionName.toLowerCase());
      expect(isCustom).toBe(true);
    });

    it("should handle registry errors gracefully", async () => {
      // Create a toolset with invalid configuration
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      // @ts-ignore - accessing private method for testing
      await expect(invalidToolset.isCustomAction("any_action"))
        .rejects.toThrow();
    });
  });

  describe('getEntity', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should get entity with valid ID", async () => {
      const entityId = "test-entity";
      const entity = await toolset.getEntity(entityId);
      
      expect(entity).toBeDefined();
      expect(entity.execute).toBeDefined();
      expect(typeof entity.execute).toBe("function");
    });

    it("should get default entity when no ID provided", async () => {
      const entity = await toolset.getEntity("default");
      
      expect(entity).toBeDefined();
      expect(entity.execute).toBeDefined();
      expect(typeof entity.execute).toBe("function");
    });

    it("should throw error for invalid entity ID", async () => {
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      await expect(invalidToolset.getEntity("invalid-entity"))
        .rejects.toThrow();
    });

    it("should handle API errors gracefully", async () => {
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      await expect(invalidToolset.getEntity("any-entity"))
        .rejects.toThrow();
    });

    it("should return entity with proper methods", async () => {
      const entity = await toolset.getEntity("default");
      
      expect(entity).toHaveProperty("execute");
      expect(entity).toHaveProperty("getConnection");
      expect(typeof entity.execute).toBe("function");
      expect(typeof entity.getConnection).toBe("function");
    });

    it("should handle connected account integration", async () => {
      const entity = await toolset.getEntity("default");
      const connection = await entity.getConnection({
        app: "github",
      });
      
      expect(connection).toBeDefined();
      expect(connection).toHaveProperty("connectionParams");
    });

    it("should validate entity response structure", async () => {
      const entity = await toolset.getEntity("default");
      
      // Verify entity structure
      expect(entity).toMatchObject({
        execute: expect.any(Function),
        getConnection: expect.any(Function),
      });
    });

    it("should maintain entity context across operations", async () => {
      const entityId = "test-context";
      const entity = await toolset.getEntity(entityId);
      
      // Execute an action to verify entity context
      const result = await entity.execute({
        actionName: "github_issues_create",
        params: { title: "Test Issue" },
      });
      
      expect(result).toBeDefined();
      expect(result.successful).toBeDefined();
    });
  });

  describe('executeAction', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should execute built-in action successfully", async () => {
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: {
          title: "Test Issue",
          body: "Test body",
        },
        entityId: "default",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should execute custom action successfully", async () => {
      const actionName = "custom_test_action";
      await toolset.createAction({
        actionName,
        inputParams: z.object({
          message: z.string(),
        }),
        callback: async (params) => ({
          data: { received: params.message },
          successful: true,
        }),
      });

      const result = await toolset.executeAction({
        action: actionName,
        params: { message: "test message" },
        entityId: "default",
      });

      expect(result.successful).toBe(true);
      expect(result.data.received).toBe("test message");
    });

    it("should throw error for missing required parameters", async () => {
      const invalidParams: Partial<z.infer<typeof ZExecuteActionParams>> = {
        params: {},
        entityId: "default"
      };
      // @ts-expect-error - Intentionally missing required action field
      await expect(toolset.executeAction(invalidParams)).rejects.toThrow();
    });

    it("should throw error for invalid parameters", async () => {
      const actionName = "validation_test_action";
      await toolset.createAction({
        actionName,
        inputParams: z.object({
          requiredField: z.string(),
        }),
        callback: async () => ({
          data: {},
          successful: true,
        }),
      });

      await expect(toolset.executeAction({
        action: actionName,
        params: {}, // Missing required field
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should throw error for non-existent action", async () => {
      await expect(toolset.executeAction({
        action: "non_existent_action",
        params: {},
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should execute action with custom entity ID", async () => {
      const customEntityId = "custom-entity";
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: customEntityId,
      });

      expect(result).toBeDefined();
      expect(result.successful).toBeDefined();
    });

    it("should execute action with connected account ID", async () => {
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: "default",
        connectedAccountId: "test-account",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBeDefined();
    });

    it("should execute action with NLA text", async () => {
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: "default",
        nlaText: "Create a test issue",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBeDefined();
    });

    it("should handle API errors gracefully", async () => {
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      await expect(invalidToolset.executeAction({
        action: "github_issues_create",
        params: {},
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should handle custom action errors", async () => {
      const actionName = "error_test_action";
      await toolset.createAction({
        actionName,
        callback: async () => {
          throw new Error("Custom action error");
        },
      });

      await expect(toolset.executeAction({
        action: actionName,
        params: {},
        entityId: "default",
      })).rejects.toThrow("Custom action error");
    });

    it("should execute pre-processor chain", async () => {
      const preProcessor = jest.fn(({ params }: Parameters<TPreProcessor>[0]) => ({
        ...params,
        processed: true,
      }));

      await toolset.addPreProcessor(preProcessor);
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: "default",
      });

      expect(preProcessor).toHaveBeenCalled();
      expect(result).toBeDefined();
      await toolset.removePreProcessor();
    });

    it("should execute post-processor chain", async () => {
      const postProcessor = jest.fn(({ toolResponse }: Parameters<TPostProcessor>[0]) => ({
        ...toolResponse,
        data: { ...toolResponse.data, processed: true },
      }));

      await toolset.addPostProcessor(postProcessor);
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: "default",
      });

      expect(postProcessor).toHaveBeenCalled();
      expect(result.data.processed).toBe(true);
      await toolset.removePostProcessor();
    });

    it("should handle file upload actions", async () => {
      const result = await toolset.executeAction({
        action: "github_upload_file",
        params: {
          content: "test content",
          path: "test.txt",
        },
        entityId: "default",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBeDefined();
    });

    it("should validate response format", async () => {
      const result = await toolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: "default",
      });

      expect(result).toMatchObject({
        successful: expect.any(Boolean),
        data: expect.any(Object),
      });
    });
  });

  // Processor Management Tests
  // Break down processor management tests into smaller suites
  describe('Processor Management', () => {
    let toolset: ComposioToolSet;

    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    // Schema Processor Tests
    describe('Schema Processors', () => {
      it('should add and remove schema processor', async () => {
        const processor: TSchemaProcessor = ({ toolSchema }: { toolSchema: RawActionData }): RawActionData => ({
          ...toolSchema,
          description: 'processed',
        });

        await toolset.addSchemaProcessor(processor);
        const tools = await toolset.getToolsSchema({ apps: ['github'] });
        expect(tools[0].description).toBe('processed');

        await toolset.removeSchemaProcessor();
        const toolsAfterRemove = await toolset.getToolsSchema({ apps: ['github'] });
        expect(toolsAfterRemove[0].description).not.toBe('processed');
      });
    });

    // Pre-processor Tests
    describe('Pre Processors', () => {
      it('should add and remove pre-processor', async () => {
        const processor: TPreProcessor = ({ params }: { params: Record<string, unknown> }): Record<string, unknown> => ({
          ...params,
          processed: true,
        });

        await toolset.addPreProcessor(processor);
        const result = await toolset.executeAction({
          action: 'test_action',
          params: { test: 'value' },
          entityId: 'default',
        });
        expect(result.data.processed).toBe(true);

        await toolset.removePreProcessor();
      });
    });

    // Post-processor Tests
    describe('Post Processors', () => {
      it('should add and remove post-processor', async () => {
        const processor: TPostProcessor = ({ toolResponse }: { toolResponse: ActionExecutionResDto }): ActionExecutionResDto => ({
          ...toolResponse,
          data: { ...toolResponse.data, postProcessed: true },
        });

        await toolset.addPostProcessor(processor);
        const result = await toolset.executeAction({
          action: 'test_action',
          params: {},
          entityId: 'default',
        });
        expect(result.data.postProcessed).toBe(true);

        await toolset.removePostProcessor();
      });
    });

    describe('Schema Processor', () => {
      it("should add valid schema processor", async () => {
        const processor: TSchemaProcessor = ({ toolSchema }) => ({
          ...toolSchema,
          parameters: {
            ...toolSchema.parameters,
            description: "Modified by processor",
          },
        });

        await toolset.addSchemaProcessor(processor);
        const tools = await toolset.getToolsSchema({
          actions: ["github_issues_create"],
        });

        expect(tools[0].parameters.description).toBe("Modified by processor");
      });

      it("should reject invalid processor type", async () => {
        // @ts-ignore - Testing invalid input
        await expect(toolset.addSchemaProcessor("not a function"))
          .rejects.toThrow("Invalid processor type");
      });

      it("should remove existing processor", async () => {
        const processor: TSchemaProcessor = ({ toolSchema }) => ({
          ...toolSchema,
          parameters: {
            ...toolSchema.parameters,
            description: "Modified by processor",
          },
        });

        await toolset.addSchemaProcessor(processor);
        await toolset.removeSchemaProcessor();

        const tools = await toolset.getToolsSchema({
          actions: ["github_issues_create"],
        });
        expect(tools[0].parameters.description).not.toBe("Modified by processor");
      });
    });

    describe('Pre-Processor', () => {
      it("should add valid pre-processor", async () => {
        const processor: TPreProcessor = ({ params }) => ({
          ...params,
          modified: true,
        });

        await toolset.addPreProcessor(processor);
        const actionName = "test_pre_processor";
        await toolset.createAction({
          actionName,
          callback: async (params) => ({
            data: { params },
            successful: true,
          }),
        });

        const result = await toolset.executeAction({
          action: actionName,
          params: { test: "value" },
          entityId: "default",
        });

        expect((result.data as { params: { modified: boolean } }).params.modified).toBe(true);
      });

      it("should reject invalid processor type", async () => {
        // @ts-ignore - Testing invalid input
        await expect(toolset.addPreProcessor("not a function"))
          .rejects.toThrow("Invalid processor type");
      });

      it("should remove existing processor", async () => {
        const processor: TPreProcessor = ({ params }) => ({
          ...params,
          modified: true,
        });

        await toolset.addPreProcessor(processor);
        await toolset.removePreProcessor();

        const actionName = "test_pre_processor_removal";
        await toolset.createAction({
          actionName,
          callback: async (params) => ({
            data: { params },
            successful: true,
          }),
        });

        const result = await toolset.executeAction({
          action: actionName,
          params: { test: "value" },
          entityId: "default",
        });

        expect((result.data as { params: { modified?: boolean } }).params.modified).toBeUndefined();
      });
    });

    describe('Post-Processor', () => {
      it("should add valid post-processor", async () => {
        const processor: TPostProcessor = ({ toolResponse }) => ({
          ...toolResponse,
          data: { ...toolResponse.data, processed: true },
        });

        await toolset.addPostProcessor(processor);
        const actionName = "test_post_processor";
        await toolset.createAction({
          actionName,
          callback: async () => ({
            data: { original: true },
            successful: true,
          }),
        });

        const result = await toolset.executeAction({
          action: actionName,
          params: {},
          entityId: "default",
        });

        expect(result.data.processed).toBe(true);
        expect(result.data.original).toBe(true);
      });

      it("should reject invalid processor type", async () => {
        // @ts-ignore - Testing invalid input
        await expect(toolset.addPostProcessor("not a function"))
          .rejects.toThrow("Invalid processor type");
      });

      it("should remove existing processor", async () => {
        const processor: TPostProcessor = ({ toolResponse }) => ({
          ...toolResponse,
          data: { ...toolResponse.data, processed: true },
        });

        await toolset.addPostProcessor(processor);
        await toolset.removePostProcessor();

        const actionName = "test_post_processor_removal";
        await toolset.createAction({
          actionName,
          callback: async () => ({
            data: { original: true },
            successful: true,
          }),
        });

        const result = await toolset.executeAction({
          action: actionName,
          params: {},
          entityId: "default",
        });

        expect(result.data.processed).toBeUndefined();
        expect(result.data.original).toBe(true);
      });
    });

    describe('Processor Chain', () => {
      it("should execute processors in correct order", async () => {
        const order: string[] = [];
        
        const preProcessor: TPreProcessor = ({ params }) => {
          order.push("pre");
          return { ...params, pre: true };
        };
        
        const postProcessor: TPostProcessor = ({ toolResponse }) => {
          order.push("post");
          return {
            ...toolResponse,
            data: { ...toolResponse.data, post: true },
          };
        };
        
        const schemaProcessor: TSchemaProcessor = ({ toolSchema }) => {
          order.push("schema");
          return {
            ...toolSchema,
            parameters: {
              ...toolSchema.parameters,
              description: "Modified by schema processor",
            },
          };
        };

        await toolset.addPreProcessor(preProcessor);
        await toolset.addPostProcessor(postProcessor);
        await toolset.addSchemaProcessor(schemaProcessor);

        const actionName = "test_processor_chain";
        await toolset.createAction({
          actionName,
          callback: async (params) => ({
            data: { params },
            successful: true,
          }),
        });

        await toolset.executeAction({
          action: actionName,
          params: {},
          entityId: "default",
        });

        expect(order).toEqual(["schema", "pre", "post"]);
      });

      it("should handle processor errors gracefully", async () => {
        const errorProcessor = () => {
          throw new Error("Processor error");
        };

        await toolset.addPreProcessor(errorProcessor);
        const actionName = "test_processor_error";
        await toolset.createAction({
          actionName,
          callback: async () => ({
            data: {},
            successful: true,
          }),
        });

        await expect(toolset.executeAction({
          action: actionName,
          params: {},
          entityId: "default",
        })).rejects.toThrow("Processor error");
      });
    });
  });

  describe('executeAction', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should execute built-in action successfully", async () => {
      const actionName = "github_issues_create";
      const params = {
        owner: "test-owner",
        repo: "test-repo",
        title: "Test Issue",
        body: "Test body",
      };

      const result = await toolset.executeAction({
        action: actionName,
        params,
        entityId: "default",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should execute custom action successfully", async () => {
      const actionName = "custom_test_action";
      await toolset.createAction({
        actionName,
        description: "Test custom action",
        inputParams: z.object({
          test: z.string(),
        }),
        callback: async (params) => ({
          data: { received: params.test },
          successful: true,
        }),
      });

      const result = await toolset.executeAction({
        action: actionName,
        params: { test: "test-value" },
        entityId: "default",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBe(true);
      expect(result.data.received).toBe("test-value");
    });

    it("should handle missing required parameters", async () => {
      const actionName = "github_issues_create";
      
      await expect(toolset.executeAction({
        action: actionName,
        params: {}, // Missing required parameters
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should handle invalid parameters", async () => {
      const actionName = "github_issues_create";
      
      await expect(toolset.executeAction({
        action: actionName,
        params: {
          owner: 123, // Should be string
          repo: true, // Should be string
        },
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should handle non-existent action name", async () => {
      await expect(toolset.executeAction({
        action: "non_existent_action",
        params: {},
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should execute action with custom entity ID", async () => {
      const customEntityId = "custom-entity";
      const actionName = "github_issues_create";
      const params = {
        owner: "test-owner",
        repo: "test-repo",
        title: "Test Issue",
        body: "Test body",
      };

      const result = await toolset.executeAction({
        action: actionName,
        params,
        entityId: customEntityId,
      });

      expect(result).toBeDefined();
      expect(result.successful).toBe(true);
    });

    it("should execute action with connected account ID", async () => {
      const actionName = "github_issues_create";
      const params = {
        owner: "test-owner",
        repo: "test-repo",
        title: "Test Issue",
        body: "Test body",
      };

      const result = await toolset.executeAction({
        action: actionName,
        params,
        entityId: "default",
        connectedAccountId: "test-account",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBe(true);
    });

    it("should execute action with NLA text", async () => {
      const actionName = "github_issues_create";
      const params = {
        owner: "test-owner",
        repo: "test-repo",
        title: "Test Issue",
        body: "Test body",
      };

      const result = await toolset.executeAction({
        action: actionName,
        params,
        entityId: "default",
        nlaText: "Create a test issue",
      });

      expect(result).toBeDefined();
      expect(result.successful).toBe(true);
    });

    it("should handle API errors gracefully", async () => {
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      await expect(invalidToolset.executeAction({
        action: "any_action",
        params: {},
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should handle custom action errors", async () => {
      const actionName = "error_test_action";
      await toolset.createAction({
        actionName,
        callback: async () => {
          throw new Error("Custom action error");
        },
      });

      await expect(toolset.executeAction({
        action: actionName,
        params: {},
        entityId: "default",
      })).rejects.toThrow("Custom action error");
    });

    it("should process response through processor chain", async () => {
      const actionName = "test_processor_action";
      const testData = { key: "value" };
      
      await toolset.createAction({
        actionName,
        callback: async () => ({
          data: testData,
          successful: true,
        }),
      });

      toolset.addPostProcessor(({ toolResponse }) => ({
        ...toolResponse,
        data: { ...toolResponse.data, processed: true },
      }));

      const result = await toolset.executeAction({
        action: actionName,
        params: {},
        entityId: "default",
      });

      expect(result.data.processed).toBe(true);
      expect(result.data.key).toBe("value");
    });

    it("should validate response format", async () => {
      const actionName = "invalid_response_action";
      await toolset.createAction({
        actionName,
        callback: async () => ({
          // Missing required fields
          data: { invalidField: true },
          successful: false,
        } satisfies ActionExecutionResDto),
      });

      await expect(toolset.executeAction({
        action: actionName,
        params: {},
        entityId: "default",
      })).rejects.toThrow();
    });
  });

  describe('getEntity', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should get entity with valid ID", async () => {
      const entityId = "test-entity";
      const entity = await toolset.getEntity(entityId);
      
      expect(entity).toBeDefined();
      expect(entity.execute).toBeDefined();
      expect(typeof entity.execute).toBe("function");
    });

    it("should get default entity", async () => {
      const entity = await toolset.getEntity("default");
      
      expect(entity).toBeDefined();
      expect(entity.execute).toBeDefined();
      expect(typeof entity.execute).toBe("function");
    });

    it("should handle API errors", async () => {
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      await expect(invalidToolset.getEntity("any-id"))
        .rejects.toThrow();
    });

    it("should get entity with invalid ID", async () => {
      // Even with invalid ID, it should return an entity object
      // The error would occur when trying to use the entity
      const entity = await toolset.getEntity("non-existent-id");
      
      expect(entity).toBeDefined();
      expect(entity.execute).toBeDefined();
      
      // Actual error occurs when trying to use the entity
      await expect(entity.execute({
        actionName: "test_action",
        params: {},
      })).rejects.toThrow();
    });
  });

  describe('isCustomAction', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should check existing custom action", async () => {
      const actionName = "test_custom_action";
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      // @ts-ignore - accessing private method for testing
      const exists = await toolset.isCustomAction(actionName);
      expect(exists).toBe(true);
    });

    it("should check non-existent action", async () => {
      // @ts-ignore - accessing private method for testing
      const exists = await toolset.isCustomAction("non_existent_action");
      expect(exists).toBe(false);
    });

    it("should check built-in action", async () => {
      // @ts-ignore - accessing private method for testing
      const exists = await toolset.isCustomAction("github_issues_create");
      expect(exists).toBe(false);
    });

    it("should handle registry errors", async () => {
      // Create invalid registry state
      // @ts-ignore - accessing private property for testing
      toolset.userActionRegistry = null;

      // @ts-ignore - accessing private method for testing
      await expect(toolset.isCustomAction("any_action"))
        .rejects.toThrow();
    });
  });

  describe('Security and Edge Cases', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should handle rate limiting", async () => {
      // Simulate rate limiting by making multiple rapid requests
      const promises = Array(10).fill(null).map(() => 
        toolset.executeAction({
          action: "github_issues_create",
          params: { title: "Test Issue" },
          entityId: "default",
        })
      );

      await expect(Promise.all(promises)).rejects.toThrow();
    });

    it("should handle authentication failures", async () => {
      const invalidToolset = new ComposioToolSet({
        apiKey: "invalid-api-key",
        baseUrl: testConfig.BACKEND_HERMES_URL,
      });

      await expect(invalidToolset.executeAction({
        action: "github_issues_create",
        params: { title: "Test Issue" },
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should handle permission issues", async () => {
      // Attempt to access restricted entity
      await expect(toolset.getEntity("restricted-entity")).rejects.toThrow();

      // Attempt to execute action without proper permissions
      await expect(toolset.executeAction({
        action: "restricted_action",
        params: {},
        entityId: "default",
      })).rejects.toThrow();
    });

    it("should handle large response payloads", async () => {
      const actionName = "large_response_action";
      const largeData = Array(1000).fill({ key: "value" });

      await toolset.createAction({
        actionName,
        callback: async () => ({
          data: { items: largeData },
          successful: true,
        } as ActionExecutionResDto),
      });

      const result = await toolset.executeAction({
        action: actionName,
        params: {},
        entityId: "default",
      });

      expect(result.data.items).toHaveLength(1000);
    });

    it("should handle concurrent execution", async () => {
      const actionName = "concurrent_action";
      let executionCount = 0;

      await toolset.createAction({
        actionName,
        callback: async () => {
          executionCount++;
          return { data: { count: executionCount }, successful: true };
        },
      });

      const promises = Array(5).fill(null).map(() =>
        toolset.executeAction({
          action: actionName,
          params: {},
          entityId: "default",
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(executionCount).toBe(5);
    });

    it("should sanitize input parameters", async () => {
      const actionName = "input_sanitization_test";
      await toolset.createAction({
        actionName,
        inputParams: z.object({
          text: z.string(),
        }),
        callback: async (params) => ({
          data: { sanitized: params.text },
          successful: true,
        }),
      });

      // Test with potentially malicious input
      const maliciousInput = "<script>alert('xss')</script>";
      const result = await toolset.executeAction({
        action: actionName,
        params: { text: maliciousInput },
        entityId: "default",
      });

      expect(result.data.sanitized).not.toContain("<script>");
    });

    it("should validate output data", async () => {
      const actionName = "output_validation_test";
      await toolset.createAction({
        actionName,
        callback: async () => ({
          data: { sensitiveData: "should-be-removed" },
          successful: true,
        }),
      });

      const result = await toolset.executeAction({
        action: actionName,
        params: {},
        entityId: "default",
      });

      // Ensure sensitive data is not exposed
      expect(result.data).not.toHaveProperty("sensitiveData");
    });
  });

  describe('createAction', () => {
    beforeEach(() => {
      toolset = new ComposioToolSet({
        apiKey: testConfig.COMPOSIO_API_KEY,
        baseUrl: testConfig.BACKEND_HERMES_URL,
        runtime: "composio-ai",
      });
    });

    it("should create valid custom action", async () => {
      const actionName = "test_custom_action";
      const description = "Test custom action";
      const inputParams = z.object({
        test: z.string(),
      });
      
      const action = await toolset.createAction({
        actionName,
        description,
        inputParams,
        callback: async (params) => {
          return {
            data: { received: params.test },
            successful: true,
          };
        },
      });

      expect(action).toBeDefined();
      expect(action.name).toBe(actionName);
      expect(action.description).toBe(description);
      expect(action.parameters).toBeDefined();
    });

    it("should create action with complex parameter types", async () => {
      const action = await toolset.createAction({
        actionName: "complex_params_action",
        description: "Action with complex params",
        inputParams: z.object({
          stringParam: z.string(),
          optionalParam: z.string().optional(),
          numberParam: z.string(),
        }),
        callback: async () => ({ data: {}, successful: true }),
      });

      expect(action.parameters.properties).toHaveProperty("stringParam");
      expect(action.parameters.properties).toHaveProperty("optionalParam");
      expect(action.parameters.properties).toHaveProperty("numberParam");
      expect(action.parameters.required).toContain("stringParam");
      expect(action.parameters.required).toContain("numberParam");
      expect(action.parameters.required).not.toContain("optionalParam");
    });

    it("should handle validation errors", async () => {
      await expect(toolset.createAction({
        // @ts-ignore - Testing invalid input
        actionName: null,
        callback: async () => ({ data: {}, successful: true }),
      })).rejects.toThrow("You must provide actionName for this action");
    });

    it("should verify action registration", async () => {
      const actionName = "test_registration";
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      const tools = await toolset.getToolsSchema({
        actions: [actionName],
      });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(actionName);
    });

    it("should handle duplicate action names case-insensitively", async () => {
      const actionName = "duplicate_action";
      await toolset.createAction({
        actionName,
        callback: async () => ({ data: {}, successful: true }),
      });

      // Try to create action with same name but different case
      const duplicateAction = await toolset.createAction({
        actionName: actionName.toUpperCase(),
        callback: async () => ({ data: {}, successful: true }),
      });

      expect(duplicateAction.name.toLowerCase()).toBe(actionName.toLowerCase());
    });
  });

  });
});

describe("ComposioToolSet - Action Execution", () => {
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeEach(() => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
    });
  });

  it("should execute an action with pre and post processors", async () => {
    const actionName = "github_issues_create";
    const requestBody = {
      owner: "utkarsh-dixit",
      repo: "speedy",
      title: "Test issue",
      body: "This is a test issue",
      appNames: "github",
    };

    const preProcessor: TPreProcessor = ({
      params,
      actionName: _actionName,
    }) => ({
      ...params,
      owner: "utkarsh-dixit",
      repo: "speedy",
      title: "Test issue2",
    });

    await toolset.addPreProcessor(preProcessor);

    const postProcessor: TPostProcessor = ({
      actionName: _actionName,
      toolResponse,
    }) => ({
      ...toolResponse,
      data: {
        ...toolResponse.data,
        processed: true,
      },
    });

    await toolset.addPostProcessor(postProcessor);

    const result = await toolset.executeAction({
      action: actionName,
      params: requestBody,
      entityId: "default",
    });

    expect(result).toBeDefined();
    expect(result.data.processed).toBe(true);

    await toolset.removePreProcessor();
    await toolset.removePostProcessor();
  });
    }: {
      actionName: string;
      toolResponse: ActionExecutionResDto;
    }) => {
      return {
        data: {
          ...toolResponse.data,
          isPostProcessed: true,
        },
        error: toolResponse.error,
        successful: toolResponse.successful,
        successfull: toolResponse.successfull,
      };
    };

    toolset.addPreProcessor(preProcessor);
    toolset.addPostProcessor(postProcessor);

    const executionResult = await toolset.executeAction({
      action: actionName,
      params: requestBody,
      entityId: "default",
    });

    expect(executionResult).toBeDefined();
    // @ts-ignore
    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult.data).toBeDefined();

    const executionResultData = executionResult.data as Record<string, unknown>;
    expect(executionResultData.title).toBe("Test issue2");
    expect(executionResultData.isPostProcessed).toBe(true);

    // Remove pre processor and post processor
    toolset.removePreProcessor();

    const executionResultAfterRemove = (await toolset.executeAction({
      action: actionName,
      params: requestBody,
      entityId: "default",
    })) as ActionExecutionResDto;

    expect(executionResultAfterRemove).toBeDefined();
    // @ts-ignore
    expect(executionResultAfterRemove).toHaveProperty("successfull", true);
    expect(executionResultAfterRemove.data).toBeDefined();
    expect(executionResultAfterRemove.data.title).toBe("Test issue");
  });

  it("should execute an file upload", async () => {
    const ACTION_NAME = "GMAIL_SEND_EMAIL";
    const actions = await toolset.getToolsSchema({ actions: [ACTION_NAME] });

    // Check if exist
    expect(
      actions[0]!.parameters.properties["attachment_file_uri_path"]
    ).toBeDefined();

    const requestBody = {
      recipient_email: "himanshu@composio.dev",
      subject: "Test email from himanshu",
      body: "This is a test email",
      attachment_file_uri_path:
        "https://composio.dev/wp-content/uploads/2024/07/Composio-Logo.webp",
    };

    const executionResult = await toolset.executeAction({
      action: ACTION_NAME,
      params: requestBody,
      entityId: "default",
    });
    expect(executionResult).toBeDefined();
    // @ts-ignore
    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult.data).toBeDefined();
  });

  it("should get tools with usecase limit", async () => {
    const tools = await toolset.getToolsSchema({
      useCase: "follow user",
      apps: ["github"],
      useCaseLimit: 1,
    });

    expect(tools.length).toBe(1);
  });
});
