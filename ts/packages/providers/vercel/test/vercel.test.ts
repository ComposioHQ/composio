import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VercelProvider } from '../src';
import { Tool } from '@composio/core';
import { jsonSchema, tool } from 'ai';

// Define an interface for our mocked Vercel tool
interface MockedVercelTool {
  description: string;
  inputSchema: any;
  execute: Function;
  _isMockedVercelTool: boolean;
}

// Mock the ai module
vi.mock('ai', () => {
  return {
    tool: vi.fn().mockImplementation(toolConfig => {
      return {
        ...toolConfig,
        _isMockedVercelTool: true,
      } as MockedVercelTool;
    }),
    jsonSchema: vi.fn().mockImplementation(schema => schema),
  };
});

describe('VercelProvider', () => {
  let provider: VercelProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new VercelProvider();

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
      tags: [],
    };

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('vercel');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Vercel tool format', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedVercelTool;

      expect(tool).toHaveBeenCalledWith({
        description: mockTool.description,
        inputSchema: mockTool.inputParameters,
        execute: expect.any(Function),
      });

      expect(jsonSchema).toHaveBeenCalledWith(mockTool.inputParameters);
      expect(wrapped._isMockedVercelTool).toBe(true);
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutParams,
        mockExecuteToolFn
      ) as unknown as MockedVercelTool;

      expect(jsonSchema).toHaveBeenCalledWith({});
      expect(wrapped._isMockedVercelTool).toBe(true);
    });

    it('should create a function that executes the tool with the right parameters', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedVercelTool;

      // Extract the execute function from the call to tool()
      const executeFunction = (tool as any).mock.calls[0][0].execute;

      // Test the execute function with an object parameter
      const params = { input: 'test-value' };
      await executeFunction(params);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);

      // Reset and test with a JSON string parameter
      vi.clearAllMocks();
      const stringParams = JSON.stringify(params);
      await executeFunction(stringParams);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools', () => {
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

      // Verify tool was called with the right parameters for each tool
      expect(tool).toHaveBeenCalledTimes(2);
      expect(tool).toHaveBeenCalledWith({
        description: mockTool.description,
        inputSchema: mockTool.inputParameters,
        execute: expect.any(Function),
      });
      expect(tool).toHaveBeenCalledWith({
        description: anotherTool.description,
        inputSchema: anotherTool.inputParameters,
        execute: expect.any(Function),
      });
    });

    it('should return an empty object for empty tools array', () => {
      const wrapped = provider.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual({});
      expect(tool).not.toHaveBeenCalled();
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
  });

  describe('strict mode', () => {
    it('should create provider with strict mode disabled by default', () => {
      const defaultProvider = new VercelProvider();
      expect(defaultProvider['strict']).toBe(false);
    });

    it('should create provider with strict mode enabled when specified', () => {
      const strictProvider = new VercelProvider({ strict: true });
      expect(strictProvider['strict']).toBe(true);
    });

    it('should use removeNonRequiredProperties when strict mode is enabled', () => {
      const strictProvider = new VercelProvider({ strict: true });

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

      // In strict mode, only required properties should be passed to jsonSchema
      expect(jsonSchema).toHaveBeenCalledWith({
        type: 'object',
        properties: {
          required_field: {
            type: 'string',
            description: 'Required field',
          },
        },
        required: ['required_field'],
        additionalProperties: false,
      });
    });

    it('should use all properties when strict mode is disabled', () => {
      const nonStrictProvider = new VercelProvider({ strict: false });

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

      // In non-strict mode, all properties should be passed to jsonSchema
      expect(jsonSchema).toHaveBeenCalledWith({
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
      });
    });

    it('should handle non-object input parameters in strict mode', () => {
      const strictProvider = new VercelProvider({ strict: true });

      const toolWithNonObjectParams: Tool = {
        ...mockTool,
        inputParameters: {
          type: 'string',
          description: 'A string parameter',
        } as any,
      };

      strictProvider.wrapTool(toolWithNonObjectParams, mockExecuteToolFn);

      // Non-object parameters should be passed as-is, even in strict mode
      expect(jsonSchema).toHaveBeenCalledWith({
        type: 'string',
        description: 'A string parameter',
      });
    });
  });

  describe('integration with Vercel AI SDK', () => {
    it('should produce tools compatible with Vercel AI SDK', () => {
      const wrapped = provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedVercelTool;

      // Verify the wrapped tool has the expected structure
      expect(wrapped).toHaveProperty('description');
      expect(wrapped).toHaveProperty('inputSchema');
      expect(wrapped).toHaveProperty('execute');

      // The tool should be compatible with Vercel AI SDK's expected structure
      expect(typeof wrapped.execute).toBe('function');
    });
  });

  describe('wrapMcpServerResponse', () => {
    it('should transform MCP URL response into standard format', () => {
      const mcpResponse = [
        { url: 'http://example.com/server1', name: 'Server 1' },
        { url: 'http://example.com/server2', name: 'Server 2' },
      ];

      const result = provider.wrapMcpServerResponse(mcpResponse);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        url: new URL('http://example.com/server1'),
        name: 'Server 1',
      });
      expect(result[1]).toEqual({
        url: new URL('http://example.com/server2'),
        name: 'Server 2',
      });
    });

    it('should handle empty MCP response', () => {
      const result = provider.wrapMcpServerResponse([]);
      expect(result).toEqual([]);
    });
  });
});
