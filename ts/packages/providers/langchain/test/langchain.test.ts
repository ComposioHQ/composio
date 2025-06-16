import { describe, it, expect, beforeEach } from 'vitest';
import { LangchainProvider } from '../src';
import { Tool } from '@composio/core';
import { DynamicStructuredTool } from '@langchain/core/tools';

describe('LangchainProvider', () => {
  let provider: LangchainProvider;
  let sampleTool: Tool;
  let executeToolFn: (
    toolSlug: string,
    params: Record<string, unknown>,
    modifiers?: any
  ) => Promise<any>;

  beforeEach(() => {
    provider = new LangchainProvider();

    // Create a real execute function that simulates tool execution
    executeToolFn = async (toolSlug: string, params: Record<string, unknown>) => {
      // Simulate actual tool execution with realistic response
      return {
        data: { toolSlug, params },
        error: null,
        successful: true,
      };
    };

    // Create a real sample tool that matches actual tool structure
    sampleTool = {
      slug: 'SEARCH_TOOL',
      name: 'Search Tool',
      description: 'Search for information in the knowledge base',
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
      expect(provider.name).toBe('langchain');
    });

    it('should be marked as agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('Tool Wrapping', () => {
    it('should successfully wrap a valid tool into LangChain format', () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);

      // Verify the wrapped tool has the correct structure
      expect(wrappedTool).toBeInstanceOf(DynamicStructuredTool);
      expect(wrappedTool.name).toBe(sampleTool.slug);
      expect(wrappedTool.description).toBe(sampleTool.description);
      expect(typeof wrappedTool.func).toBe('function');
    });

    it('should wrap a tool that can be executed with parameters', async () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);
      const searchParams = { query: 'test search' };

      const result = await wrappedTool.func(searchParams);
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

    it('should fail to wrap a tool without toolkit', () => {
      const invalidTool = { ...sampleTool, toolkit: undefined };

      expect(() => {
        provider.wrapTool(invalidTool, executeToolFn);
      }).toThrow('App name is not defined');
    });

    it('should fail to wrap a tool without input parameters', () => {
      const invalidTool = { ...sampleTool, inputParameters: undefined };

      expect(() => {
        provider.wrapTool(invalidTool, executeToolFn);
      }).toThrow('Tool input parameters are not defined');
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
      expect(wrappedTools[0].name).toBe('SEARCH_TOOL');
      expect(wrappedTools[1].name).toBe('WEATHER_TOOL');
      expect(wrappedTools.every(tool => tool instanceof DynamicStructuredTool)).toBe(true);
    });

    it('should handle empty tools array', () => {
      const wrappedTools = provider.wrapTools([], executeToolFn);
      expect(wrappedTools).toEqual([]);
    });
  });

  describe('LangChain Integration', () => {
    it('should produce tools that can be used with LangChain', async () => {
      const wrappedTool = provider.wrapTool(sampleTool, executeToolFn);

      // Verify the tool has all required LangChain properties
      expect(wrappedTool).toHaveProperty('name');
      expect(wrappedTool).toHaveProperty('description');
      expect(wrappedTool).toHaveProperty('schema');
      expect(wrappedTool).toHaveProperty('func');

      // Test actual execution through LangChain interface
      const result = await wrappedTool.func({ query: 'test query' });
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });
  });
});
