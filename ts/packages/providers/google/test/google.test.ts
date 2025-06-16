import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleProvider } from '../src';
import { Tool } from '@composio/core';

describe('GoogleProvider', () => {
  let provider: GoogleProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new GoogleProvider();

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
      expect(provider.name).toBe('google');
    });
  });

  describe('_isAgentic property', () => {
    it('should be non-agentic', () => {
      expect(provider._isAgentic).toBe(false);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Google GenAI function declaration format', () => {
      const wrapped = provider.wrapTool(mockTool);

      expect(wrapped).toEqual({
        name: mockTool.slug,
        description: mockTool.description,
        parameters: {
          type: 'object',
          description: mockTool.description,
          properties: mockTool.inputParameters?.properties || {},
          required: mockTool.inputParameters?.required || [],
        },
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutParams);

      expect(wrapped).toEqual({
        name: toolWithoutParams.slug,
        description: toolWithoutParams.description,
        parameters: {
          type: 'object',
          description: toolWithoutParams.description,
          properties: {},
          required: [],
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
        parameters: {
          type: 'object',
          description: mockTool.description,
          properties: mockTool.inputParameters?.properties || {},
          required: mockTool.inputParameters?.required || [],
        },
      });

      expect(wrapped[1]).toEqual({
        name: anotherTool.slug,
        description: anotherTool.description,
        parameters: {
          type: 'object',
          description: anotherTool.description,
          properties: anotherTool.inputParameters?.properties || {},
          required: anotherTool.inputParameters?.required || [],
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
      const toolCall = {
        name: 'test-tool',
        args: { input: 'test-value' },
      };

      const result = await provider.executeToolCall(userId, toolCall);

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
      expect(result).toBe(
        JSON.stringify({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
    });

    it('should pass options to executeTool', async () => {
      const userId = 'test-user';
      const toolCall = {
        name: 'test-tool',
        args: { input: 'test-value' },
      };

      const options = {
        connectedAccountId: 'conn-123',
        customAuthParams: {
          parameters: [{ name: 'token', value: 'abc123', in: 'header' as const }],
        },
      };

      const modifiers = {
        beforeExecute: vi.fn(params => params),
        afterExecute: vi.fn(response => response),
      };

      await provider.executeToolCall(userId, toolCall, options, modifiers);

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
        beforeExecute: vi.fn(params => params),
        afterExecute: vi.fn(response => response),
      };

      await provider.executeTool(toolSlug, toolParams, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
    });
  });
});
