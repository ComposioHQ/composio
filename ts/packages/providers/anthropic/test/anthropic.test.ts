import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, AnthropicToolUseBlock } from '../src';
import type { AnthropicTool } from '../src/types';
import type { Tool } from '@composio/core';
import Anthropic from '@anthropic-ai/sdk';

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
      expect(results).toEqual([JSON.stringify({ result: 'success' })]);
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
        JSON.stringify({ result: 'success-1' }),
        JSON.stringify({ result: 'success-2' }),
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
});
