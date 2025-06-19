import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIResponsesProvider } from '../src';
import { Tool } from '@composio/core';
import { OpenAI } from 'openai';

// Mock the openai modules
vi.mock('openai', () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => ({
      beta: {
        threads: {
          runs: {
            retrieve: vi.fn().mockImplementation((threadId, runId) => {
              return { id: runId, status: 'completed' };
            }),
            submitToolOutputs: vi.fn().mockImplementation((threadId, runId, options) => {
              return { id: runId, status: 'completed' };
            }),
          },
        },
      },
    })),
  };
});

// Define interfaces for our OpenAI mocked types
interface MockedOpenAITool {
  type: 'function';
  name: string;
  description?: string;
  parameters?: any;
  strict?: boolean;
}

describe('OpenAIResponsesProvider', () => {
  let provider: OpenAIResponsesProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new OpenAIResponsesProvider();

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
      expect(provider.name).toBe('openai');
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in OpenAI function format', () => {
      const wrapped = provider.wrapTool(mockTool) as MockedOpenAITool;

      expect(wrapped).toEqual({
        type: 'function',
        name: mockTool.slug,
        description: mockTool.description,
        parameters: mockTool.inputParameters,
        strict: false,
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutParams) as MockedOpenAITool;

      expect(wrapped).toEqual({
        type: 'function',
        name: toolWithoutParams.slug,
        description: toolWithoutParams.description,
        parameters: {},
        strict: false,
      });
    });

    it('should respect strict mode when wrapping tools', () => {
      const strictProvider = new OpenAIResponsesProvider({ strict: true });
      const wrapped = strictProvider.wrapTool(mockTool) as MockedOpenAITool;

      expect(wrapped.strict).toBe(true);
      expect(wrapped.parameters).toEqual(mockTool.inputParameters);
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
        type: 'function',
        name: mockTool.slug,
        description: mockTool.description,
        parameters: mockTool.inputParameters,
        strict: false,
      });
      expect(wrapped[1]).toEqual({
        type: 'function',
        name: anotherTool.slug,
        description: anotherTool.description,
        parameters: anotherTool.inputParameters,
        strict: false,
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
        id: 'call-123',
        type: 'function',
        name: 'test-tool',
        arguments: JSON.stringify({ input: 'test-value' }),
        call_id: 'call-123',
      } as unknown as OpenAI.Responses.ResponseFunctionToolCall;

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
        id: 'call-123',
        type: 'function',
        name: 'test-tool',
        arguments: JSON.stringify({ input: 'test-value' }),
        call_id: 'call-123',
      } as unknown as OpenAI.Responses.ResponseFunctionToolCall;

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

  describe('handleToolCalls', () => {
    it('should handle tool calls from OpenAI response', async () => {
      const userId = 'test-user';
      const toolCalls = [
        {
          id: 'call-123',
          type: 'function_call',
          name: 'test-tool',
          arguments: JSON.stringify({ input: 'test-value' }),
          call_id: 'call-123',
        },
      ] as OpenAI.Responses.ResponseOutputItem[];

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockResolvedValue(JSON.stringify({ result: 'success' }));

      const results = await provider.handleToolCalls(userId, toolCalls);

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        userId,
        {
          id: 'call-123',
          name: 'test-tool',
          arguments: JSON.stringify({ input: 'test-value' }),
        },
        undefined,
        undefined
      );
      expect(results).toEqual([
        {
          call_id: 'call-123',
          type: 'function_call_output',
          output: JSON.stringify({ result: 'success' }),
          status: 'completed',
        },
      ]);
    });

    it('should handle errors during tool execution', async () => {
      const userId = 'test-user';
      const toolCalls = [
        {
          id: 'call-123',
          type: 'function_call',
          name: 'test-tool',
          arguments: JSON.stringify({ input: 'test-value' }),
          call_id: 'call-123',
        },
      ] as OpenAI.Responses.ResponseOutputItem[];

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockRejectedValue(new Error('Tool execution failed'));

      const results = await provider.handleToolCalls(userId, toolCalls);

      expect(results).toEqual([
        {
          call_id: 'call-123',
          type: 'function_call_output',
          output: 'Tool execution failed',
          status: 'incomplete',
        },
      ]);
    });

    it('should handle multiple tool calls', async () => {
      const userId = 'test-user';
      const toolCalls = [
        {
          id: 'call-123',
          type: 'function_call',
          name: 'test-tool-1',
          arguments: JSON.stringify({ input: 'test-value-1' }),
          call_id: 'call-123',
        },
        {
          id: 'call-456',
          type: 'function_call',
          name: 'test-tool-2',
          arguments: JSON.stringify({ input: 'test-value-2' }),
          call_id: 'call-456',
        },
      ] as OpenAI.Responses.ResponseOutputItem[];

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy
        .mockResolvedValueOnce(JSON.stringify({ result: 'success-1' }))
        .mockResolvedValueOnce(JSON.stringify({ result: 'success-2' }));

      const results = await provider.handleToolCalls(userId, toolCalls);

      expect(executeToolCallSpy).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        {
          call_id: 'call-123',
          type: 'function_call_output',
          output: JSON.stringify({ result: 'success-1' }),
          status: 'completed',
        },
        {
          call_id: 'call-456',
          type: 'function_call_output',
          output: JSON.stringify({ result: 'success-2' }),
          status: 'completed',
        },
      ]);
    });
  });

  describe('handleResponse', () => {
    it('should handle OpenAI response with tool calls', async () => {
      const userId = 'test-user';
      const response = {
        id: 'response-123',
        created_at: new Date().toISOString(),
        output: [
          {
            id: 'call-123',
            type: 'function_call',
            name: 'test-tool',
            arguments: JSON.stringify({ input: 'test-value' }),
            call_id: 'call-123',
          },
        ],
        output_text: 'Test output',
        error: null,
        status: 'completed',
      } as unknown as OpenAI.Responses.Response;

      const handleToolCallsSpy = vi.spyOn(provider, 'handleToolCalls');
      handleToolCallsSpy.mockResolvedValue([
        {
          call_id: 'call-123',
          type: 'function_call_output',
          output: JSON.stringify({ result: 'success' }),
          status: 'completed',
        },
      ]);

      const results = await provider.handleResponse(userId, response);

      expect(handleToolCallsSpy).toHaveBeenCalledWith(
        userId,
        response.output,
        undefined,
        undefined
      );
      expect(results).toEqual([
        {
          call_id: 'call-123',
          type: 'function_call_output',
          output: JSON.stringify({ result: 'success' }),
          status: 'completed',
        },
      ]);
    });

    it('should handle OpenAI response without tool calls', async () => {
      const userId = 'test-user';
      const response = {
        id: 'response-123',
        created_at: new Date().toISOString(),
        output: [],
        output_text: 'Test output',
        error: null,
        status: 'completed',
      } as unknown as OpenAI.Responses.Response;

      const handleToolCallsSpy = vi.spyOn(provider, 'handleToolCalls');
      handleToolCallsSpy.mockResolvedValue([]);

      const results = await provider.handleResponse(userId, response);

      expect(handleToolCallsSpy).toHaveBeenCalledWith(userId, [], undefined, undefined);
      expect(results).toEqual([]);
    });

    it('should handle OpenAI response with undefined output', async () => {
      const userId = 'test-user';
      const response = {
        id: 'response-123',
        created_at: new Date().toISOString(),
        output_text: 'Test output',
        error: null,
        status: 'completed',
      } as unknown as OpenAI.Responses.Response;

      const handleToolCallsSpy = vi.spyOn(provider, 'handleToolCalls');
      handleToolCallsSpy.mockResolvedValue([]);

      const results = await provider.handleResponse(userId, response);

      expect(handleToolCallsSpy).toHaveBeenCalledWith(userId, [], undefined, undefined);
      expect(results).toEqual([]);
    });
  });
});
