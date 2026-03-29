import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, AnthropicToolUseBlock } from '../src';
import type { AnthropicTool } from '../src/types';
import type { Tool } from '@composio/core';
import Anthropic from '@anthropic-ai/sdk';
import { sanitizeSchemaPropertyKeys, restoreOriginalKeys } from '../src/sanitize-keys';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_123',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'tool_use',
              id: 'tu_123',
              name: 'test-tool',
              input: { input: 'test-value' },
            },
          ],
        }),
      },
    })),
  };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new AnthropicProvider();

    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    provider._setExecuteToolFn(mockExecuteToolFn);

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

    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('anthropic');
    });
  });

  describe('_isAgentic property', () => {
    it('should be non-agentic', () => {
      expect(provider._isAgentic).toBe(false);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Anthropic format', () => {
      const wrapped = provider.wrapTool(mockTool) as AnthropicTool;

      expect(wrapped).toEqual({
        name: mockTool.slug,
        description: mockTool.description,
        input_schema: {
          type: 'object',
          properties: mockTool.inputParameters?.properties,
          required: mockTool.inputParameters?.required,
        },
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutParams) as AnthropicTool;

      expect(wrapped).toEqual({
        name: toolWithoutParams.slug,
        description: toolWithoutParams.description,
        input_schema: {
          type: 'object',
          properties: {} as Record<string, unknown>,
          required: [] as string[],
        },
      });
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

      const wrapped = provider.wrapTools(tools);

      expect(wrapped).toHaveLength(2);

      expect(wrapped[0]).toEqual({
        name: mockTool.slug,
        description: mockTool.description,
        input_schema: {
          type: 'object',
          properties: mockTool.inputParameters?.properties,
          required: mockTool.inputParameters?.required,
        },
      });

      expect(wrapped[1]).toEqual({
        name: anotherTool.slug,
        description: anotherTool.description,
        input_schema: {
          type: 'object',
          properties: anotherTool.inputParameters?.properties,
          required: anotherTool.inputParameters?.required,
        },
      });
    });

    it('should return an empty array for empty tools array', () => {
      const wrapped = provider.wrapTools([]);
      expect(wrapped).toEqual([]);
    });
  });

  describe('executeToolCall', () => {
    it('should execute a tool call and return the result as string', async () => {
      const userId = 'test-user';
      const toolUse: AnthropicToolUseBlock = {
        type: 'tool_use',
        id: 'tu_123',
        name: 'test-tool',
        input: { input: 'test-value' },
      };

      const result = await provider.executeToolCall(userId, toolUse);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        {
          arguments: { input: 'test-value' },
          userId: 'test-user',
          connectedAccountId: undefined,
          customAuthParams: undefined,
        },
        undefined
      );
      expect(result).toBe(JSON.stringify({ result: 'success' }));
    });

    it('should pass options to executeTool', async () => {
      const userId = 'test-user';
      const toolUse: AnthropicToolUseBlock = {
        type: 'tool_use',
        id: 'tu_123',
        name: 'test-tool',
        input: { input: 'test-value' },
      };

      const options = {
        connectedAccountId: 'conn-123',
        customAuthParams: {
          parameters: [{ name: 'token', value: 'abc123', in: 'header' as const }],
        },
      };

      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      await provider.executeToolCall(userId, toolUse, options, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        {
          arguments: { input: 'test-value' },
          userId: 'test-user',
          connectedAccountId: 'conn-123',
          customAuthParams: options.customAuthParams,
        },
        modifiers
      );
    });
  });

  describe('handleToolCalls', () => {
    it('should handle tool calls from Anthropic message', async () => {
      const userId = 'test-user';
      const message = {
        id: 'msg_123',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'tool_use',
            id: 'tu_123',
            name: 'test-tool',
            input: { input: 'test-value' },
          },
        ],
      } as Anthropic.Message;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockResolvedValue(JSON.stringify({ result: 'success' }));

      const results = await provider.handleToolCalls(userId, message);

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          type: 'tool_use',
          id: 'tu_123',
          name: 'test-tool',
          input: { input: 'test-value' },
        }),
        undefined,
        undefined
      );
      expect(results).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu_123',
              content: JSON.stringify({ result: 'success' }),
              cache_control: undefined,
            },
          ],
        },
      ]);
    });

    it('should handle multiple tool calls', async () => {
      const userId = 'test-user';
      const message = {
        id: 'msg_123',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'tool_use',
            id: 'tu_123',
            name: 'test-tool-1',
            input: { input: 'test-value-1' },
          },
          {
            type: 'tool_use',
            id: 'tu_456',
            name: 'test-tool-2',
            input: { input: 'test-value-2' },
          },
        ],
      } as Anthropic.Message;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy
        .mockResolvedValueOnce(JSON.stringify({ result: 'success-1' }))
        .mockResolvedValueOnce(JSON.stringify({ result: 'success-2' }));

      const results = await provider.handleToolCalls(userId, message);

      expect(executeToolCallSpy).toHaveBeenCalledTimes(2);
      expect(executeToolCallSpy).toHaveBeenNthCalledWith(
        1,
        userId,
        expect.objectContaining({
          type: 'tool_use',
          id: 'tu_123',
          name: 'test-tool-1',
          input: { input: 'test-value-1' },
        }),
        undefined,
        undefined
      );
      expect(executeToolCallSpy).toHaveBeenNthCalledWith(
        2,
        userId,
        expect.objectContaining({
          type: 'tool_use',
          id: 'tu_456',
          name: 'test-tool-2',
          input: { input: 'test-value-2' },
        }),
        undefined,
        undefined
      );
      expect(results).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu_123',
              content: JSON.stringify({ result: 'success-1' }),
              cache_control: undefined,
            },
            {
              type: 'tool_result',
              tool_use_id: 'tu_456',
              content: JSON.stringify({ result: 'success-2' }),
              cache_control: undefined,
            },
          ],
        },
      ]);
    });

    it('should handle messages without tool calls', async () => {
      const userId = 'test-user';
      const message = {
        id: 'msg_123',
        content: [{ type: 'text', text: 'Hello' }],
      } as Anthropic.Message;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');

      const results = await provider.handleToolCalls(userId, message);

      expect(executeToolCallSpy).not.toHaveBeenCalled();
      expect(results).toEqual([]);
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
      it('should transform McpUrlResponse to AnthropicMcpServerGetResponse format', () => {
        const mcpResponse = [
          { name: 'server-1', url: 'https://mcp1.example.com' },
          { name: 'server-2', url: 'https://mcp2.example.com' },
          { name: 'server-3', url: 'https://mcp3.example.com' },
        ];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
          url: 'https://mcp1.example.com',
          name: 'server-1',
          type: 'url',
        });
        expect(result[1]).toEqual({
          url: 'https://mcp2.example.com',
          name: 'server-2',
          type: 'url',
        });
        expect(result[2]).toEqual({
          url: 'https://mcp3.example.com',
          name: 'server-3',
          type: 'url',
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
          url: 'https://single.example.com',
          name: 'single-server',
          type: 'url',
        });
      });

      it('should preserve URL strings exactly', () => {
        const mcpResponse = [
          { name: 'http-server', url: 'http://insecure.example.com' },
          { name: 'https-server', url: 'https://secure.example.com' },
          { name: 'port-server', url: 'https://example.com:8080/path' },
          { name: 'query-server', url: 'https://example.com?param=value' },
          { name: 'fragment-server', url: 'https://example.com#section' },
        ];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        expect(result).toHaveLength(5);

        // Verify URLs are preserved as strings exactly
        expect(result[0].url).toBe('http://insecure.example.com');
        expect(result[1].url).toBe('https://secure.example.com');
        expect(result[2].url).toBe('https://example.com:8080/path');
        expect(result[3].url).toBe('https://example.com?param=value');
        expect(result[4].url).toBe('https://example.com#section');

        // All should have type 'url'
        result.forEach(item => {
          expect(item.type).toBe('url');
        });
      });
    });

    describe('MCP integration with provider', () => {
      it('should correctly type the MCP response transformation', () => {
        const mcpResponse = [{ name: 'test-server', url: 'https://test.example.com' }];

        const result = provider.wrapMcpServerResponse(mcpResponse);

        // TypeScript should infer this as AnthropicMcpServerGetResponse
        expect(result[0]).toHaveProperty('url');
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('type');
        expect(result[0].url).toBe('https://test.example.com');
        expect(result[0].type).toBe('url');
      });

      it('should work with MCP provider instance', () => {
        // Verify the provider can transform MCP responses
        const newProvider = new AnthropicProvider();
        const testResponse = [{ name: 'test', url: 'https://test.com' }];

        const result = newProvider.wrapMcpServerResponse(testResponse);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('test');
        expect(result[0].url).toBe('https://test.com');
        expect(result[0].type).toBe('url');
      });
    });
  });

  describe('property key sanitization (issue #2330)', () => {
    it('should truncate property keys exceeding 64 characters', () => {
      const longKeyTool: Tool = {
        slug: 'ZOOM_CREATE_A_MEETING',
        name: 'Create a Meeting',
        description: 'Create a Zoom meeting',
        inputParameters: {
          type: 'object',
          properties: {
            short_key: { type: 'string' },
            settings__approved__or__denied__countries__or__regions__approved__list: {
              type: 'array',
              description: 'Approved countries list',
            },
            settings__approved__or__denied__countries__or__regions__denied__list: {
              type: 'array',
              description: 'Denied countries list',
            },
            settings__continuous__meeting__chat__auto__add__invited__external__users: {
              type: 'boolean',
              description: 'Auto add external users',
            },
          },
          required: ['settings__approved__or__denied__countries__or__regions__approved__list'],
        },
        tags: [],
      };

      const wrapped = provider.wrapTool(longKeyTool) as AnthropicTool;
      const properties = wrapped.input_schema.properties as Record<string, unknown>;
      const propertyKeys = Object.keys(properties);

      // All keys should be <= 64 characters
      for (const key of propertyKeys) {
        expect(key.length).toBeLessThanOrEqual(64);
      }

      // Short key should be unchanged
      expect(propertyKeys).toContain('short_key');

      // Should still have 4 properties
      expect(propertyKeys).toHaveLength(4);

      // All truncated keys should be unique
      const uniqueKeys = new Set(propertyKeys);
      expect(uniqueKeys.size).toBe(4);

      // Required array should also be updated
      const required = (wrapped.input_schema as any).required as string[];
      expect(required).toHaveLength(1);
      expect(required[0].length).toBeLessThanOrEqual(64);
    });

    it('should not modify schemas with keys under 64 characters', () => {
      const wrapped = provider.wrapTool(mockTool) as AnthropicTool;

      expect(wrapped.input_schema).toEqual({
        type: 'object',
        properties: mockTool.inputParameters?.properties,
        required: mockTool.inputParameters?.required,
      });
    });

    it('should restore original keys when executing tool calls', async () => {
      const longKey = 'settings__approved__or__denied__countries__or__regions__approved__list';
      const longKeyTool: Tool = {
        slug: 'ZOOM_TOOL',
        name: 'Zoom Tool',
        description: 'A zoom tool',
        inputParameters: {
          type: 'object',
          properties: {
            [longKey]: { type: 'string' },
          },
          required: [],
        },
        tags: [],
      };

      // Wrap the tool (stores key mapping)
      const wrapped = provider.wrapTool(longKeyTool) as AnthropicTool;
      const truncatedKey = Object.keys(
        wrapped.input_schema.properties as Record<string, unknown>
      )[0];

      // Execute with the truncated key
      const toolUse: AnthropicToolUseBlock = {
        type: 'tool_use',
        id: 'tu_zoom',
        name: 'ZOOM_TOOL',
        input: { [truncatedKey]: 'US,CA' },
      };

      await provider.executeToolCall('user-1', toolUse);

      // The execute function should receive the ORIGINAL key
      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'ZOOM_TOOL',
        expect.objectContaining({
          arguments: { [longKey]: 'US,CA' },
        }),
        undefined
      );
    });
  });

  describe('sanitizeSchemaPropertyKeys', () => {
    it('should return schema unchanged when all keys are within limit', () => {
      const schema = {
        type: 'object' as const,
        properties: { name: { type: 'string' }, age: { type: 'number' } },
        required: ['name'],
      };
      const { schema: result, keyMap } = sanitizeSchemaPropertyKeys(schema);
      expect(result).toBe(schema); // same reference, no changes
      expect(keyMap.size).toBe(0);
    });

    it('should handle schema without properties', () => {
      const schema = { type: 'object' as const };
      const { schema: result, keyMap } = sanitizeSchemaPropertyKeys(schema);
      expect(result).toBe(schema);
      expect(keyMap.size).toBe(0);
    });

    it('should truncate keys and produce deterministic results', () => {
      const longKey = 'a'.repeat(70);
      const schema = {
        type: 'object' as const,
        properties: { [longKey]: { type: 'string' } },
      };
      const { schema: result, keyMap } = sanitizeSchemaPropertyKeys(schema);
      const newKey = Object.keys(result.properties!)[0];

      expect(newKey.length).toBe(64);
      expect(keyMap.size).toBe(1);
      expect(keyMap.get(newKey)).toBe(longKey);

      // Deterministic: same input produces same output
      const { schema: result2 } = sanitizeSchemaPropertyKeys(schema);
      expect(Object.keys(result2.properties!)[0]).toBe(newKey);
    });

    it('should produce unique truncated keys for different long keys', () => {
      const key1 = 'settings__approved__or__denied__countries__or__regions__approved__list';
      const key2 = 'settings__approved__or__denied__countries__or__regions__denied__list';
      const schema = {
        type: 'object' as const,
        properties: {
          [key1]: { type: 'string' },
          [key2]: { type: 'string' },
        },
      };
      const { schema: result } = sanitizeSchemaPropertyKeys(schema);
      const keys = Object.keys(result.properties!);

      expect(keys[0]).not.toBe(keys[1]);
      expect(keys[0].length).toBeLessThanOrEqual(64);
      expect(keys[1].length).toBeLessThanOrEqual(64);
    });
  });

  describe('restoreOriginalKeys', () => {
    it('should restore mapped keys', () => {
      const keyMap = new Map([['short_abc1234', 'very_long_original_key']]);
      const input = { short_abc1234: 'value', other: 'val2' };
      const result = restoreOriginalKeys(input, keyMap);
      expect(result).toEqual({ very_long_original_key: 'value', other: 'val2' });
    });

    it('should pass through with empty map', () => {
      const input = { key: 'value' };
      const result = restoreOriginalKeys(input, new Map());
      expect(result).toBe(input);
    });
  });
});
