import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../src';
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

vi.mock('openai/streaming', () => {
  return {
    Stream: vi.fn(),
  };
});

// Define interfaces for our OpenAI mocked types
interface MockedOpenAIChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new OpenAIProvider();

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

  describe('_isAgentic property', () => {
    it('should be non-agentic', () => {
      expect(provider._isAgentic).toBe(false);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in OpenAI function format', () => {
      const wrapped = provider.wrapTool(mockTool) as MockedOpenAIChatCompletionTool;

      expect(wrapped).toEqual({
        type: 'function',
        function: {
          name: mockTool.slug,
          description: mockTool.description,
          parameters: mockTool.inputParameters,
        },
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutParams) as MockedOpenAIChatCompletionTool;

      expect(wrapped).toEqual({
        type: 'function',
        function: {
          name: toolWithoutParams.slug,
          description: toolWithoutParams.description,
          parameters: undefined,
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

      // Verify the result is an array of the right length
      expect(wrapped).toHaveLength(2);

      // Verify each tool was properly wrapped
      expect(wrapped[0]).toEqual({
        type: 'function',
        function: {
          name: mockTool.slug,
          description: mockTool.description,
          parameters: mockTool.inputParameters,
        },
      });

      expect(wrapped[1]).toEqual({
        type: 'function',
        function: {
          name: anotherTool.slug,
          description: anotherTool.description,
          parameters: anotherTool.inputParameters,
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
        id: 'call-123',
        type: 'function',
        function: {
          name: 'test-tool',
          arguments: JSON.stringify({ input: 'test-value' }),
        },
      } as OpenAI.ChatCompletionMessageToolCall;

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
        function: {
          name: 'test-tool',
          arguments: JSON.stringify({ input: 'test-value' }),
        },
      } as OpenAI.ChatCompletionMessageToolCall;

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

  describe('handleToolCall', () => {
    it('should handle tool calls from chat completion', async () => {
      const userId = 'test-user';
      const chatCompletion = {
        id: 'chat-123',
        model: 'gpt-4',
        created: 123456789,
        object: 'chat.completion',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-123',
                  type: 'function',
                  function: {
                    name: 'test-tool',
                    arguments: JSON.stringify({ input: 'test-value' }),
                  },
                } as const,
              ],
            },
            index: 0,
            finish_reason: 'tool_calls' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      } as OpenAI.ChatCompletion;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockResolvedValue(JSON.stringify({ result: 'success' }));

      const results = await provider.handleToolCall(userId, chatCompletion);

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        userId,
        chatCompletion.choices[0].message.tool_calls![0],
        undefined,
        undefined
      );
      expect(results).toEqual([JSON.stringify({ result: 'success' })]);
    });

    it('should handle multiple tool calls', async () => {
      const userId = 'test-user';
      const chatCompletion = {
        id: 'chat-123',
        model: 'gpt-4',
        created: 123456789,
        object: 'chat.completion',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-123',
                  type: 'function',
                  function: {
                    name: 'test-tool',
                    arguments: JSON.stringify({ input: 'test-value-1' }),
                  },
                } as const,
              ],
            },
            index: 0,
            finish_reason: 'tool_calls' as const,
          },
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-456',
                  type: 'function',
                  function: {
                    name: 'another-tool',
                    arguments: JSON.stringify({ input: 'test-value-2' }),
                  },
                } as const,
              ],
            },
            index: 1,
            finish_reason: 'tool_calls' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      } as OpenAI.ChatCompletion;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy
        .mockResolvedValueOnce(JSON.stringify({ result: 'success-1' }))
        .mockResolvedValueOnce(JSON.stringify({ result: 'success-2' }));

      const results = await provider.handleToolCall(userId, chatCompletion);

      expect(executeToolCallSpy).toHaveBeenCalledTimes(2);
      expect(executeToolCallSpy).toHaveBeenNthCalledWith(
        1,
        userId,
        chatCompletion.choices[0].message.tool_calls![0],
        undefined,
        undefined
      );
      expect(executeToolCallSpy).toHaveBeenNthCalledWith(
        2,
        userId,
        chatCompletion.choices[1].message.tool_calls![0],
        undefined,
        undefined
      );
      expect(results).toEqual([
        JSON.stringify({ result: 'success-1' }),
        JSON.stringify({ result: 'success-2' }),
      ]);
    });
  });

  describe('handleAssistantMessage', () => {
    it('should process tool calls from an assistant run', async () => {
      const userId = 'test-user';
      const run = {
        id: 'run-123',
        required_action: {
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'tool-call-123',
                type: 'function',
                function: {
                  name: 'test-tool',
                  arguments: JSON.stringify({ input: 'test-value' }),
                },
              },
            ],
          },
        },
      } as unknown as OpenAI.Beta.Threads.Run;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockResolvedValue(JSON.stringify({ result: 'success' }));

      const toolOutputs = await provider.handleAssistantMessage(userId, run);

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        userId,
        run.required_action?.submit_tool_outputs
          ?.tool_calls[0] as OpenAI.ChatCompletionMessageToolCall,
        undefined,
        undefined
      );
      expect(toolOutputs).toEqual([
        {
          tool_call_id: 'tool-call-123',
          output: JSON.stringify(JSON.stringify({ result: 'success' })),
        },
      ]);
    });

    it('should handle runs without tool calls', async () => {
      const userId = 'test-user';
      const run = {
        id: 'run-123',
      } as OpenAI.Beta.Threads.Run;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');

      const toolOutputs = await provider.handleAssistantMessage(userId, run);

      expect(executeToolCallSpy).not.toHaveBeenCalled();
      expect(toolOutputs).toEqual([]);
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

  describe('waitAndHandleAssistantToolCalls', () => {
    it('should handle and submit tool outputs for an assistant run', async () => {
      const userId = 'test-user';
      const client = new OpenAI();
      const thread = { id: 'thread-123' } as OpenAI.Beta.Threads.Thread;
      const run = {
        id: 'run-123',
        status: 'requires_action',
        required_action: {
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'tool-call-123',
                type: 'function',
                function: {
                  name: 'test-tool',
                  arguments: JSON.stringify({ input: 'test-value' }),
                },
              },
            ],
          },
        },
      } as OpenAI.Beta.Threads.Run;

      const handleAssistantMessageSpy = vi.spyOn(provider, 'handleAssistantMessage');
      handleAssistantMessageSpy.mockResolvedValue([
        {
          tool_call_id: 'tool-call-123',
          output: JSON.stringify({ result: 'success' }),
        },
      ]);

      const result = await provider.waitAndHandleAssistantToolCalls(userId, client, run, thread);

      expect(handleAssistantMessageSpy).toHaveBeenCalledWith(userId, run, undefined, undefined);
      expect(client.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith(thread.id, run.id, {
        tool_outputs: [
          {
            tool_call_id: 'tool-call-123',
            output: JSON.stringify({ result: 'success' }),
          },
        ],
      });
      expect(result).toEqual({ id: 'run-123', status: 'completed' });
    });
  });
});
