import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LlamaindexProvider, LlamaindexTool } from '../src';
import { Tool } from '@composio/core';

// Mock the llamaindex module
vi.mock('llamaindex', () => {
  return {
    tool: vi.fn().mockImplementation(config => ({
      metadata: {
        name: config.name,
        description: config.description,
        parameters: config.parameters,
      },
      call: config.execute,
      // Mock LlamaIndex tool properties
      _type: 'llamaindex_tool',
      _config: config,
    })),
    JSONValue: {},
  };
});

describe('LlamaindexProvider', () => {
  let provider: LlamaindexProvider;
  let sampleTool: Tool;
  let executeToolFn: (toolSlug: string, params: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    provider = new LlamaindexProvider();

    // Create a real execute function that simulates tool execution
    executeToolFn = vi
      .fn()
      .mockImplementation(async (toolSlug: string, params: Record<string, unknown>) => {
        // Simulate actual tool execution with realistic response
        return {
          data: { toolSlug, params },
          error: null,
          successful: true,
        };
      });

    // Create a real sample tool that matches actual tool structure
    sampleTool = {
      slug: 'SEARCH_TOOL',
      name: 'Search Tool',
      description: 'Search for information in the knowledge base',
      version: '20250909_00',
      availableVersions: ['20250909_00', '20250901_00'],
      inputParameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      toolkit: {
        slug: 'search_toolkit',
        name: 'Search Toolkit',
      },
      tags: ['search', 'knowledge'],
    };
  });

  describe('Provider Configuration', () => {
    it('should be properly initialized with correct name', () => {
      expect(provider.name).toBe('llamaindex');
    });

    it('should be marked as agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('Tool Wrapping', () => {
    it('should successfully wrap a valid tool into LlamaIndex format', () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);

      // Verify the wrapped tool has the correct structure
      expect(wrappedTool.metadata.name).toBe(sampleTool.slug);
      expect(wrappedTool.metadata.description).toBe(sampleTool.description);
      expect(wrappedTool).toHaveProperty('metadata');
      expect(wrappedTool).toHaveProperty('call');
      expect(typeof wrappedTool.call).toBe('function');
    });

    it('should wrap a tool that can be executed with parameters', async () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);
      const searchParams = { query: 'test search' };

      const result = await wrappedTool.call(searchParams);
      const parsedResult = JSON.parse(result as string);

      expect(parsedResult).toEqual({
        data: {
          toolSlug: sampleTool.slug,
          params: searchParams,
        },
        error: null,
        successful: true,
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams = { ...sampleTool, inputParameters: undefined };

      const wrappedTool = provider.wrapTool(toolWithoutParams, executeToolFn);

      expect(wrappedTool.metadata.name).toBe(toolWithoutParams.slug);
      expect(wrappedTool.metadata.description).toBe(toolWithoutParams.description);
      expect(wrappedTool.metadata).toHaveProperty('parameters');
    });

    it('should handle tools without description', () => {
      const toolWithoutDescription = { ...sampleTool, description: undefined };

      const wrappedTool = provider.wrapTool(toolWithoutDescription, executeToolFn);

      expect(wrappedTool.metadata.name).toBe(toolWithoutDescription.slug);
      expect(wrappedTool.metadata.description).toBe(toolWithoutDescription.name); // Falls back to tool name
      expect(wrappedTool.metadata).toHaveProperty('parameters');
    });

    it('should handle tools without description and name', () => {
      const toolWithoutDescriptionAndName = {
        ...sampleTool,
        description: undefined,
        name: '', // Empty name to test final fallback
      };

      const wrappedTool = provider.wrapTool(toolWithoutDescriptionAndName, executeToolFn);

      expect(wrappedTool.metadata.name).toBe(toolWithoutDescriptionAndName.slug);
      expect(wrappedTool.metadata.description).toBe(''); // Final fallback to empty string
      expect(wrappedTool.metadata).toHaveProperty('parameters');
    });
  });

  describe('Multiple Tools Wrapping', () => {
    it('should wrap multiple tools correctly', () => {
      const anotherTool: Tool = {
        ...sampleTool,
        slug: 'WEATHER_TOOL',
        name: 'Weather Tool',
        description: 'Get weather information',
        inputParameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'Location to get weather for',
            },
          },
          required: ['location'],
          additionalProperties: false,
        },
      };

      const tools = [sampleTool, anotherTool];
      const wrappedTools = provider.wrapTools(tools, executeToolFn);

      expect(wrappedTools).toHaveLength(2);
      expect(wrappedTools[0].metadata.name).toBe('SEARCH_TOOL');
      expect(wrappedTools[1].metadata.name).toBe('WEATHER_TOOL');
      expect(wrappedTools.every(tool => typeof tool.call === 'function')).toBe(true);
    });

    it('should handle empty tools array', () => {
      const wrappedTools = provider.wrapTools([], executeToolFn);
      expect(wrappedTools).toEqual([]);
    });
  });

  describe('LlamaIndex Integration', () => {
    it('should produce tools that can be used with LlamaIndex', async () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);

      // Verify the tool has all required LlamaIndex properties
      expect(wrappedTool).toHaveProperty('metadata');
      expect(wrappedTool.metadata).toHaveProperty('name');
      expect(wrappedTool.metadata).toHaveProperty('description');
      expect(wrappedTool.metadata).toHaveProperty('parameters');
      expect(wrappedTool).toHaveProperty('call');

      // Test actual execution through LlamaIndex interface
      const result = await wrappedTool.call({ query: 'test query' });
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should return JSONValue from call function', async () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);
      const result = await wrappedTool.call({ query: 'test' });

      // Should be a JSON string (JSONValue)
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result as string);
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('successful');
    });

    it('should handle execution errors gracefully', async () => {
      const errorExecuteFn = vi.fn().mockRejectedValue(new Error('Tool execution failed'));
      const wrappedTool = provider.wrapTool(sampleTool, errorExecuteFn);

      await expect(wrappedTool.call({ query: 'test' })).rejects.toThrow('Tool execution failed');
    });
  });

  describe('MCP Server Response Transformation', () => {
    it('should transform McpUrlResponse to standard format with URL objects', () => {
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

    it('should create proper URL objects from string URLs', () => {
      const mcpResponse = [
        { name: 'http-server', url: 'http://insecure.example.com' },
        { name: 'https-server', url: 'https://secure.example.com' },
        { name: 'port-server', url: 'https://example.com:8080/path' },
        { name: 'query-server', url: 'https://example.com?param=value' },
        { name: 'fragment-server', url: 'https://example.com#section' },
      ];

      const result = provider.wrapMcpServerResponse(mcpResponse);

      expect(result).toHaveLength(5);

      // Verify URLs are proper URL objects
      expect(result[0].url).toBeInstanceOf(URL);
      expect(result[1].url).toBeInstanceOf(URL);
      expect(result[2].url).toBeInstanceOf(URL);
      expect(result[3].url).toBeInstanceOf(URL);
      expect(result[4].url).toBeInstanceOf(URL);

      // Verify URL values
      expect(result[0].url.href).toBe('http://insecure.example.com/');
      expect(result[1].url.href).toBe('https://secure.example.com/');
      expect(result[2].url.href).toBe('https://example.com:8080/path');
      expect(result[3].url.href).toBe('https://example.com/?param=value');
      expect(result[4].url.href).toBe('https://example.com/#section');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle tools with complex input parameters', () => {
      const complexTool: Tool = {
        ...sampleTool,
        slug: 'COMPLEX_TOOL',
        inputParameters: {
          type: 'object',
          properties: {
            stringParam: { type: 'string' },
            numberParam: { type: 'number' },
            booleanParam: { type: 'boolean' },
            arrayParam: { type: 'array', items: { type: 'string' } },
            objectParam: {
              type: 'object',
              properties: {
                nestedString: { type: 'string' },
                nestedNumber: { type: 'number' },
              },
            },
          },
          required: ['stringParam', 'numberParam'],
        },
      };

      const wrappedTool = provider.wrapTool(complexTool, executeToolFn);

      expect(wrappedTool.metadata.name).toBe('COMPLEX_TOOL');
      expect(wrappedTool.metadata).toHaveProperty('parameters');
    });

    it('should handle execution with various parameter types', async () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);
      const complexParams = {
        query: 'test search',
        options: {
          limit: 10,
          includeMetadata: true,
        },
        tags: ['search', 'test'],
      };

      const result = await wrappedTool.call(complexParams);
      const parsedResult = JSON.parse(result as string);

      expect(parsedResult.data.params).toEqual(complexParams);
    });
  });
});
