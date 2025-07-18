import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAgentsProvider } from '../src';
import { Tool } from '@composio/core';
import { tool as createOpenAIAgentTool } from '@openai/agents';

// Define an interface for our mocked OpenAI Agent tool
interface MockedOpenAIAgentTool {
  name: string;
  description: string;
  parameters: any;
  execute: Function;
  _isMockedOpenAIAgentTool: boolean;
}

// Mock the @openai/agents module
vi.mock('@openai/agents', () => {
  return {
    tool: vi.fn().mockImplementation(toolConfig => {
      return {
        ...toolConfig,
        _isMockedOpenAIAgentTool: true,
      } as MockedOpenAIAgentTool;
    }),
  };
});

describe('OpenAIAgentsProvider', () => {
  let provider: OpenAIAgentsProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new OpenAIAgentsProvider();

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
      expect(provider.name).toBe('openai-agents');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in OpenAI Agent tool format', () => {
      const wrapped = provider.wrapTool(
        mockTool,
        mockExecuteToolFn
      ) as unknown as MockedOpenAIAgentTool;

      expect(createOpenAIAgentTool).toHaveBeenCalledWith({
        name: mockTool.slug,
        description: mockTool.description,
        parameters: expect.any(Object),
        execute: expect.any(Function),
      });

      expect(wrapped._isMockedOpenAIAgentTool).toBe(true);
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutParams,
        mockExecuteToolFn
      ) as unknown as MockedOpenAIAgentTool;

      expect(wrapped._isMockedOpenAIAgentTool).toBe(true);
    });

    it('should create a function that executes the tool with the right parameters', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn) as unknown as MockedOpenAIAgentTool;

      // Extract the execute function from the call to tool()
      const executeFunction = (createOpenAIAgentTool as any).mock.calls[0][0].execute;

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

      expect(Array.isArray(wrapped)).toBe(true);
      expect(wrapped).toHaveLength(2);
      expect(wrapped[0]).toHaveProperty('name', 'test-tool');
      expect(wrapped[1]).toHaveProperty('name', 'another-tool');

      // Verify tool was called with the right parameters for each tool
      expect(createOpenAIAgentTool).toHaveBeenCalledTimes(2);
      expect(createOpenAIAgentTool).toHaveBeenCalledWith({
        name: mockTool.slug,
        description: mockTool.description,
        parameters: expect.any(Object),
        execute: expect.any(Function),
      });
      expect(createOpenAIAgentTool).toHaveBeenCalledWith({
        name: anotherTool.slug,
        description: anotherTool.description,
        parameters: expect.any(Object),
        execute: expect.any(Function),
      });
    });

    it('should return an empty array for empty tools array', () => {
      const wrapped = provider.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual([]);
      expect(createOpenAIAgentTool).not.toHaveBeenCalled();
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

  describe('MCP functionality', () => {
    describe('wrapMcpServerResponse', () => {
      it('should transform McpUrlResponse to standard McpServerGetResponse format', () => {
        const mcpResponse = [
          { name: 'server-1', url: 'https://mcp1.example.com' },
          { name: 'server-2', url: 'https://mcp2.example.com' },
          { name: 'server-3', url: 'https://mcp3.example.com' },
        ];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
          url: new URL('https://mcp1.example.com'),
          name: 'server-1',
        });
        expect(result[1]).toEqual({
          url: new URL('https://mcp2.example.com'),
          name: 'server-2',
        });
        expect(result[2]).toEqual({
          url: new URL('https://mcp3.example.com'),
          name: 'server-3',
        });
      });

      it('should handle empty array', () => {
        const mcpResponse: Array<{ name: string; url: string }> = [];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
      });

      it('should handle single item array', () => {
        const mcpResponse = [{ name: 'single-server', url: 'https://single.example.com' }];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          url: new URL('https://single.example.com'),
          name: 'single-server',
        });
      });
    });

    describe('MCP integration with provider', () => {
      it('should correctly type the MCP response transformation', () => {
        const mcpResponse = [{ name: 'test-server', url: 'https://test.example.com' }];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        // TypeScript should infer this as McpServerGetResponse
        expect(result[0]).toHaveProperty('url');
        expect(result[0]).toHaveProperty('name');
        expect(result[0].url).toBeInstanceOf(URL);
        expect(result[0].url.href).toBe('https://test.example.com/');
      });

      it('should work with MCP provider instance', () => {
        // Verify the provider can transform MCP responses
        const newProvider = new OpenAIAgentsProvider();
        const testResponse = [{ name: 'test', url: 'https://test.com' }];

        const result = newProvider.wrapMcpServerResponse(testResponse);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('test');
        expect(result[0].url.href).toBe('https://test.com/');
      });
    });
  });
});
