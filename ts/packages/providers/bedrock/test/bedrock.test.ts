/**
 * @file Unit tests for AWS Bedrock Provider
 * @module providers/bedrock/test
 * @description
 * Unit tests for the Bedrock provider following repository testing patterns.
 * Uses mocks for AWS SDK and tool execution.
 *
 * @copyright Composio 2024
 * @license ISC
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BedrockProvider } from '../src';
import type { BedrockTool } from '../src/types';
import type { Tool } from '@composio/core';

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        output: {
          message: {
            content: [{ text: 'Hello from Bedrock' }],
          },
        },
        stopReason: 'end_turn',
      }),
    })),
    ConverseCommand: vi.fn().mockImplementation(input => input),
  };
});

describe('BedrockProvider', () => {
  let provider: BedrockProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new BedrockProvider();

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
      expect(provider.name).toBe('bedrock');
    });
  });

  describe('_isAgentic property', () => {
    it('should be non-agentic', () => {
      expect(provider._isAgentic).toBe(false);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Bedrock format', () => {
      const wrapped = provider.wrapTool(mockTool) as BedrockTool;

      expect(wrapped).toEqual({
        toolSpec: {
          name: mockTool.slug,
          description: mockTool.description,
          inputSchema: {
            json: {
              type: 'object',
              properties: mockTool.inputParameters?.properties,
              required: mockTool.inputParameters?.required,
            },
          },
        },
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutParams) as BedrockTool;

      expect(wrapped).toEqual({
        toolSpec: {
          name: toolWithoutParams.slug,
          description: toolWithoutParams.description,
          inputSchema: {
            json: {
              type: 'object',
              properties: {},
              // Note: required field is omitted when not present (semantically correct)
            },
          },
        },
      });
    });

    it('should handle tools without description', () => {
      const toolWithoutDescription: Tool = {
        ...mockTool,
        description: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutDescription) as BedrockTool;

      expect(wrapped.toolSpec.description).toBe('');
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
        toolSpec: {
          name: mockTool.slug,
          description: mockTool.description,
          inputSchema: {
            json: {
              type: 'object',
              properties: mockTool.inputParameters?.properties,
              required: mockTool.inputParameters?.required,
            },
          },
        },
      });

      expect(wrapped[1]).toEqual({
        toolSpec: {
          name: anotherTool.slug,
          description: anotherTool.description,
          inputSchema: {
            json: {
              type: 'object',
              properties: anotherTool.inputParameters?.properties,
              required: anotherTool.inputParameters?.required,
            },
          },
        },
      });
    });

    it('should return an empty array for empty tools array', () => {
      const wrapped = provider.wrapTools([]);
      expect(wrapped).toEqual([]);
    });
  });

  describe('executeToolCall', () => {
    it('should execute a tool call and return formatted result', async () => {
      const userId = 'test-user';
      const toolUse = {
        toolUseId: 'tu_123',
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
          customConnectionData: undefined,
        },
        undefined
      );
      expect(result).toEqual({
        toolUseId: 'tu_123',
        content: [{ json: { result: 'success' } }],
        status: 'success',
      });
    });

    it('should pass options to executeTool', async () => {
      const userId = 'test-user';
      const toolUse = {
        toolUseId: 'tu_123',
        name: 'test-tool',
        input: { input: 'test-value' },
      };

      const options = {
        connectedAccountId: 'conn-123',
        customAuthParams: {
          parameters: [{ name: 'token', value: 'abc123', in: 'header' as const }],
        },
        customConnectionData: { apiKey: 'test-key' },
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
          customConnectionData: options.customConnectionData,
        },
        modifiers
      );
    });

    it('should handle tool execution errors', async () => {
      mockExecuteToolFn.mockRejectedValueOnce(new Error('Tool execution failed'));

      const userId = 'test-user';
      const toolUse = {
        toolUseId: 'tu_error',
        name: 'error-tool',
        input: {},
      };

      const result = await provider.executeToolCall(userId, toolUse);

      expect(result).toEqual({
        toolUseId: 'tu_error',
        content: [{ text: 'Error executing tool: Tool execution failed' }],
        status: 'error',
      });
    });
  });

  describe('handleToolCalls', () => {
    it('should handle tool calls from Bedrock Converse output', async () => {
      const userId = 'test-user';
      const converseOutput = {
        output: {
          message: {
            content: [
              { text: 'Analyzing request...' },
              {
                toolUse: {
                  toolUseId: 'tu_123',
                  name: 'test-tool',
                  input: { input: 'test-value' },
                },
              },
            ],
          },
        },
      };

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockResolvedValue({
        toolUseId: 'tu_123',
        content: [{ json: { result: 'success' } }],
        status: 'success',
      });

      const results = await provider.handleToolCalls(userId, converseOutput as any);

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          toolUseId: 'tu_123',
          name: 'test-tool',
          input: { input: 'test-value' },
        }),
        undefined,
        undefined
      );
      expect(results).toEqual([
        {
          toolUseId: 'tu_123',
          content: [{ json: { result: 'success' } }],
          status: 'success',
        },
      ]);
    });

    it('should handle multiple tool calls', async () => {
      const userId = 'test-user';
      const converseOutput = {
        output: {
          message: {
            content: [
              { text: 'Processing...' },
              {
                toolUse: {
                  toolUseId: 'tu_123',
                  name: 'test-tool-1',
                  input: { input: 'test-value-1' },
                },
              },
              {
                toolUse: {
                  toolUseId: 'tu_456',
                  name: 'test-tool-2',
                  input: { input: 'test-value-2' },
                },
              },
            ],
          },
        },
      };

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy
        .mockResolvedValueOnce({
          toolUseId: 'tu_123',
          content: [{ json: { result: 'success-1' } }],
          status: 'success',
        })
        .mockResolvedValueOnce({
          toolUseId: 'tu_456',
          content: [{ json: { result: 'success-2' } }],
          status: 'success',
        });

      const results = await provider.handleToolCalls(userId, converseOutput as any);

      expect(executeToolCallSpy).toHaveBeenCalledTimes(2);
      expect(executeToolCallSpy).toHaveBeenNthCalledWith(
        1,
        userId,
        expect.objectContaining({
          toolUseId: 'tu_123',
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
          toolUseId: 'tu_456',
          name: 'test-tool-2',
          input: { input: 'test-value-2' },
        }),
        undefined,
        undefined
      );
      expect(results).toHaveLength(2);
    });

    it('should handle messages without tool calls', async () => {
      const userId = 'test-user';
      const converseOutput = {
        output: {
          message: {
            content: [{ text: 'Just a text response' }],
          },
        },
      };

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');

      const results = await provider.handleToolCalls(userId, converseOutput as any);

      expect(executeToolCallSpy).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('should handle missing output gracefully', async () => {
      const userId = 'test-user';
      const converseOutput = {};

      const results = await provider.handleToolCalls(userId, converseOutput as any);

      expect(results).toEqual([]);
    });

    it('should handle missing message content gracefully', async () => {
      const userId = 'test-user';
      const converseOutput = {
        output: {
          message: {},
        },
      };

      const results = await provider.handleToolCalls(userId, converseOutput as any);

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
