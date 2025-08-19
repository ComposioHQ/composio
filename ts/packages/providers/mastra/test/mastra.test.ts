import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MastraProvider } from '../src';
import { Tool } from '@composio/core';
import { createTool } from '@mastra/core';

// Define an interface for our mocked Mastra tool
interface MockedMastraTool {
  id: string;
  description: string;
  inputSchema?: any;
  outputSchema?: any;
  execute: Function;
  _isMockedMastraTool: boolean;
}

// Mock the @mastra/core module
vi.mock('@mastra/core', () => {
  return {
    createTool: vi.fn().mockImplementation(toolConfig => {
      return {
        id: toolConfig.id,
        description: toolConfig.description,
        inputSchema: toolConfig.inputSchema,
        outputSchema: toolConfig.outputSchema,
        execute: toolConfig.execute,
        _isMockedMastraTool: true,
      } as MockedMastraTool;
    }),
  };
});

// Mock the jsonSchemaToZodSchema function from @composio/core
vi.mock('@composio/core', async () => {
  const actual = await vi.importActual('@composio/core');
  return {
    ...(actual as object),
    jsonSchemaToZodSchema: vi.fn().mockImplementation(schema => {
      return { type: 'mock-zod-schema', originalSchema: schema };
    }),
  };
});

describe('MastraProvider', () => {
  let provider: MastraProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new MastraProvider();

    // Mock the global execute tool function
    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    provider._setExecuteToolFn(mockExecuteToolFn);

    // Create a mock Composio tool
    mockTool = {
      slug: 'test-tool',
      name: 'Test Tool',
      description: 'A tool for testing',
      inputParameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Test input',
          },
        },
        required: ['input'],
      },
      outputParameters: {
        type: 'object',
        properties: {
          result: {
            type: 'string',
            description: 'Test result',
          },
        },
      },
      toolkit: {
        slug: 'test-toolkit',
        name: 'Test Toolkit',
      },
      tags: [],
    };

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('mastra');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Mastra createTool format', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedMastraTool;

      expect(createTool).toHaveBeenCalledWith({
        id: mockTool.slug,
        description: mockTool.description,
        inputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.inputParameters },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedMastraTool).toBe(true);
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutInputParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutInputParams,
        mockExecuteToolFn
      ) as unknown as MockedMastraTool;

      expect(createTool).toHaveBeenCalledWith({
        id: toolWithoutInputParams.slug,
        description: toolWithoutInputParams.description,
        inputSchema: { type: 'mock-zod-schema', originalSchema: {} },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedMastraTool).toBe(true);
    });

    it('should handle tools without output parameters', () => {
      const toolWithoutOutputParams: Tool = {
        ...mockTool,
        outputParameters: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutOutputParams,
        mockExecuteToolFn
      ) as unknown as MockedMastraTool;

      expect(createTool).toHaveBeenCalledWith({
        id: toolWithoutOutputParams.slug,
        description: toolWithoutOutputParams.description,
        inputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.inputParameters },
        outputSchema: undefined,
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedMastraTool).toBe(true);
    });

    it('should handle tools without description', () => {
      const toolWithoutDescription: Tool = {
        ...mockTool,
        description: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutDescription,
        mockExecuteToolFn
      ) as unknown as MockedMastraTool;

      expect(createTool).toHaveBeenCalledWith({
        id: toolWithoutDescription.slug,
        description: '',
        inputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.inputParameters },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedMastraTool).toBe(true);
    });

    it('should create a function that executes the tool with the right parameters', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedMastraTool;

      // Extract the execute function from the call to createTool()
      const executeFunction = (createTool as any).mock.calls[0][0].execute;

      // Test the execute function
      const context = { input: 'test-value' };
      const result = await executeFunction({ context });

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, context);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });

    it('should handle empty context parameter', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedMastraTool;

      // Extract the execute function from the call to createTool()
      const executeFunction = (createTool as any).mock.calls[0][0].execute;

      // Test the execute function with empty context
      const result = await executeFunction({ context: {} });

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, {});
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });

    it('should handle missing context parameter', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedMastraTool;

      // Extract the execute function from the call to createTool()
      const executeFunction = (createTool as any).mock.calls[0][0].execute;

      // Test the execute function without context
      const result = await executeFunction({});

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, undefined);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools in a collection', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'another-tool',
        name: 'Another Tool',
      };
      const tools = [mockTool, anotherTool];

      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      // Verify the result has the expected properties
      expect(Object.keys(wrapped)).toHaveLength(2);
      expect(wrapped['test-tool']).toBeDefined();
      expect(wrapped['another-tool']).toBeDefined();

      // Verify createTool was called with the right parameters for each tool
      expect(createTool).toHaveBeenCalledTimes(2);
      expect(createTool).toHaveBeenCalledWith({
        id: mockTool.slug,
        description: mockTool.description,
        inputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.inputParameters },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });
      expect(createTool).toHaveBeenCalledWith({
        id: anotherTool.slug,
        description: anotherTool.description,
        inputSchema: { type: 'mock-zod-schema', originalSchema: anotherTool.inputParameters },
        outputSchema: { type: 'mock-zod-schema', originalSchema: anotherTool.outputParameters },
        execute: expect.any(Function),
      });
    });

    it('should return an empty object for empty tools array', () => {
      const wrapped = provider.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual({});
      expect(createTool).not.toHaveBeenCalled();
    });

    it('should use tool slugs as keys in the collection', () => {
      const tools = [
        { ...mockTool, slug: 'first-tool' },
        { ...mockTool, slug: 'second-tool' },
        { ...mockTool, slug: 'third-tool' },
      ];

      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      expect(Object.keys(wrapped)).toEqual(['first-tool', 'second-tool', 'third-tool']);
      expect(wrapped['first-tool']).toBeDefined();
      expect(wrapped['second-tool']).toBeDefined();
      expect(wrapped['third-tool']).toBeDefined();
    });

    it('should handle duplicate tool slugs by overwriting', () => {
      const tools = [
        { ...mockTool, slug: 'duplicate-tool', name: 'First Tool' },
        { ...mockTool, slug: 'duplicate-tool', name: 'Second Tool' },
      ];

      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      expect(Object.keys(wrapped)).toHaveLength(1);
      expect(wrapped['duplicate-tool']).toBeDefined();
      expect(createTool).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeTool', () => {
    it('should execute a tool using the global execute function', async () => {
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
      };

      const result = await provider.executeTool(toolSlug, toolParams);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, undefined);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });

    it('should pass modifiers to the global execute function', async () => {
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
      };

      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      await provider.executeTool(toolSlug, toolParams, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
    });

    it('should handle execution errors gracefully', async () => {
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
      };

      const errorResponse = {
        data: null,
        error: { message: 'Tool execution failed' },
        successful: false,
      };

      mockExecuteToolFn.mockResolvedValueOnce(errorResponse);

      const result = await provider.executeTool(toolSlug, toolParams);

      expect(result).toEqual(errorResponse);
    });
  });

  describe('integration with Mastra', () => {
    it('should produce tools compatible with Mastra createTool', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedMastraTool;

      // Verify the wrapped tool has the expected structure
      expect(wrapped).toHaveProperty('id');
      expect(wrapped).toHaveProperty('description');
      expect(wrapped).toHaveProperty('inputSchema');
      expect(wrapped).toHaveProperty('outputSchema');
      expect(wrapped).toHaveProperty('execute');

      // The execute property should be a function
      expect(typeof wrapped.execute).toBe('function');
    });

    it('should create tools with correct id mapping from slug', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedMastraTool;

      expect(createTool).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockTool.slug,
        })
      );
    });

    it('should handle tools without schemas gracefully', () => {
      const minimalTool: Tool = {
        slug: 'minimal-tool',
        name: 'Minimal Tool',
        description: 'A minimal tool',
        tags: [],
      };

      const wrapped = provider.wrapTool(
        minimalTool,
        mockExecuteToolFn
      ) as unknown as MockedMastraTool;

      expect(createTool).toHaveBeenCalledWith({
        id: 'minimal-tool',
        description: 'A minimal tool',
        inputSchema: { type: 'mock-zod-schema', originalSchema: {} },
        outputSchema: undefined,
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedMastraTool).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle execution failures in wrapped tools', async () => {
      const errorExecuteToolFn = vi.fn().mockRejectedValue(new Error('Execution failed'));

      const wrapped = provider.wrapTool(
        mockTool,
        errorExecuteToolFn
      ) as unknown as MockedMastraTool;
      const executeFunction = (createTool as any).mock.calls[0][0].execute;

      await expect(executeFunction({ context: { input: 'test' } })).rejects.toThrow(
        'Execution failed'
      );
    });

    it('should handle tools with malformed schemas', () => {
      const toolWithMalformedSchema: Tool = {
        ...mockTool,
        inputParameters: null as any,
        outputParameters: undefined,
      };

      expect(() => {
        provider.wrapTool(toolWithMalformedSchema, mockExecuteToolFn);
      }).not.toThrow();
    });
  });

  describe('type safety', () => {
    it('should maintain correct typing for MastraTool', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn);

      // Type assertion should work
      expect(wrapped).toBeDefined();
      expect(typeof wrapped).toBe('object');
    });

    it('should maintain correct typing for MastraToolCollection', () => {
      const tools = [mockTool];
      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      // Should be an object with string keys
      expect(typeof wrapped).toBe('object');
      expect(Array.isArray(wrapped)).toBe(false);
    });
  });

  describe('strict mode', () => {
    it('should create provider with strict mode disabled by default', () => {
      const defaultProvider = new MastraProvider();
      expect(defaultProvider['strict']).toBe(false);
    });

    it('should create provider with strict mode enabled when specified', () => {
      const strictProvider = new MastraProvider({ strict: true });
      expect(strictProvider['strict']).toBe(true);
    });

    it('should use removeNonRequiredProperties when strict mode is enabled', () => {
      const strictProvider = new MastraProvider({ strict: true });

      const toolWithOptionalProps: Tool = {
        ...mockTool,
        inputParameters: {
          type: 'object',
          properties: {
            required_field: {
              type: 'string',
              description: 'Required field',
            },
            optional_field: {
              type: 'string',
              description: 'Optional field',
            },
          },
          required: ['required_field'],
        },
      };

      strictProvider.wrapTool(toolWithOptionalProps, mockExecuteToolFn);

      // In strict mode, only required properties should be passed to jsonSchemaToZodSchema
      // The removeNonRequiredProperties function should have been called and filtered the schema
      expect(createTool).toHaveBeenCalledWith({
        id: toolWithOptionalProps.slug,
        description: toolWithOptionalProps.description,
        inputSchema: {
          type: 'mock-zod-schema',
          originalSchema: {
            type: 'object',
            properties: {
              required_field: {
                type: 'string',
                description: 'Required field',
              },
            },
            required: ['required_field'],
            additionalProperties: false,
          },
        },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });
    });

    it('should use all properties when strict mode is disabled', () => {
      const nonStrictProvider = new MastraProvider({ strict: false });

      const toolWithOptionalProps: Tool = {
        ...mockTool,
        inputParameters: {
          type: 'object',
          properties: {
            required_field: {
              type: 'string',
              description: 'Required field',
            },
            optional_field: {
              type: 'string',
              description: 'Optional field',
            },
          },
          required: ['required_field'],
        },
      };

      nonStrictProvider.wrapTool(toolWithOptionalProps, mockExecuteToolFn);

      // In non-strict mode, all properties should be passed to jsonSchemaToZodSchema
      expect(createTool).toHaveBeenCalledWith({
        id: toolWithOptionalProps.slug,
        description: toolWithOptionalProps.description,
        inputSchema: {
          type: 'mock-zod-schema',
          originalSchema: {
            type: 'object',
            properties: {
              required_field: {
                type: 'string',
                description: 'Required field',
              },
              optional_field: {
                type: 'string',
                description: 'Optional field',
              },
            },
            required: ['required_field'],
          },
        },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });
    });

    it('should handle non-object input parameters in strict mode', () => {
      const strictProvider = new MastraProvider({ strict: true });

      const toolWithNonObjectParams: Tool = {
        ...mockTool,
        inputParameters: {
          type: 'string',
          description: 'A string parameter',
        } as any,
      };

      strictProvider.wrapTool(toolWithNonObjectParams, mockExecuteToolFn);

      // Non-object parameters should be passed as-is, even in strict mode
      expect(createTool).toHaveBeenCalledWith({
        id: toolWithNonObjectParams.slug,
        description: toolWithNonObjectParams.description,
        inputSchema: {
          type: 'mock-zod-schema',
          originalSchema: {
            type: 'string',
            description: 'A string parameter',
          },
        },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });
    });

    it('should handle undefined input parameters in strict mode', () => {
      const strictProvider = new MastraProvider({ strict: true });

      const toolWithoutInputParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      strictProvider.wrapTool(toolWithoutInputParams, mockExecuteToolFn);

      // Undefined parameters should result in empty object being passed to jsonSchemaToZodSchema
      expect(createTool).toHaveBeenCalledWith({
        id: toolWithoutInputParams.slug,
        description: toolWithoutInputParams.description,
        inputSchema: { type: 'mock-zod-schema', originalSchema: {} },
        outputSchema: { type: 'mock-zod-schema', originalSchema: mockTool.outputParameters },
        execute: expect.any(Function),
      });
    });

    it('should work correctly with wrapTools in strict mode', () => {
      const strictProvider = new MastraProvider({ strict: true });

      const toolsWithOptionalProps: Tool[] = [
        {
          ...mockTool,
          slug: 'tool1',
          inputParameters: {
            type: 'object',
            properties: {
              required_field: { type: 'string' },
              optional_field: { type: 'string' },
            },
            required: ['required_field'],
          },
        },
        {
          ...mockTool,
          slug: 'tool2',
          inputParameters: {
            type: 'object',
            properties: {
              another_required: { type: 'number' },
              another_optional: { type: 'boolean' },
            },
            required: ['another_required'],
          },
        },
      ];

      const wrapped = strictProvider.wrapTools(toolsWithOptionalProps, mockExecuteToolFn);

      expect(Object.keys(wrapped)).toEqual(['tool1', 'tool2']);
      expect(createTool).toHaveBeenCalledTimes(2);

      // Both tools should have their schemas filtered for required properties only
      expect(createTool).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: 'tool1',
          inputSchema: {
            type: 'mock-zod-schema',
            originalSchema: expect.objectContaining({
              properties: expect.objectContaining({
                required_field: expect.any(Object),
              }),
              additionalProperties: false,
            }),
          },
        })
      );

      expect(createTool).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: 'tool2',
          inputSchema: {
            type: 'mock-zod-schema',
            originalSchema: expect.objectContaining({
              properties: expect.objectContaining({
                another_required: expect.any(Object),
              }),
              additionalProperties: false,
            }),
          },
        })
      );
    });
  });

  describe('MCP functionality', () => {
    describe('wrapMcpServerResponse', () => {
      it('should transform McpUrlResponse to MastraUrlMap format', () => {
        const mcpResponse = [
          { name: 'server-1', url: 'https://mcp1.example.com' },
          { name: 'server-2', url: 'https://mcp2.example.com' },
          { name: 'server-3', url: 'https://mcp3.example.com' },
        ];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(result).toEqual({
          'server-1': { url: 'https://mcp1.example.com' },
          'server-2': { url: 'https://mcp2.example.com' },
          'server-3': { url: 'https://mcp3.example.com' },
        });
      });

      it('should handle empty array', () => {
        const mcpResponse: Array<{ name: string; url: string }> = [];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(result).toEqual({});
      });

      it('should handle single item array', () => {
        const mcpResponse = [{ name: 'single-server', url: 'https://single.example.com' }];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(result).toEqual({
          'single-server': { url: 'https://single.example.com' },
        });
      });

      it('should handle duplicate names by overwriting', () => {
        const mcpResponse = [
          { name: 'duplicate', url: 'https://first.example.com' },
          { name: 'duplicate', url: 'https://second.example.com' },
          { name: 'unique', url: 'https://unique.example.com' },
        ];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        // The second duplicate should overwrite the first
        expect(result).toEqual({
          duplicate: { url: 'https://second.example.com' },
          unique: { url: 'https://unique.example.com' },
        });
      });

      it('should preserve URL format exactly', () => {
        const mcpResponse = [
          { name: 'http-server', url: 'http://insecure.example.com' },
          { name: 'https-server', url: 'https://secure.example.com' },
          { name: 'port-server', url: 'https://example.com:8080/path' },
          { name: 'query-server', url: 'https://example.com?param=value' },
          { name: 'fragment-server', url: 'https://example.com#section' },
        ];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(result).toEqual({
          'http-server': { url: 'http://insecure.example.com' },
          'https-server': { url: 'https://secure.example.com' },
          'port-server': { url: 'https://example.com:8080/path' },
          'query-server': { url: 'https://example.com?param=value' },
          'fragment-server': { url: 'https://example.com#section' },
        });
      });
    });

    describe('MCP integration with provider', () => {
      it('should correctly type the MCP response transformation', () => {
        const mcpResponse = [{ name: 'test-server', url: 'https://test.example.com' }];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        // TypeScript should infer this as MastraUrlMap
        const urlMap: { [name: string]: { url: string } } = result;
        expect(urlMap['test-server'].url).toBe('https://test.example.com');
      });

      it('should work with MCP provider instance', () => {
        // Verify the provider can transform MCP responses
        const newProvider = new MastraProvider();
        const testResponse = [{ name: 'test', url: 'https://test.com' }];

        const result = newProvider.wrapMcpServerResponse(testResponse);
        expect(result).toEqual({ test: { url: 'https://test.com' } });
      });
    });
  });
});
