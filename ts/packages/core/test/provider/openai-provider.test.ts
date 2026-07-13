import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../src/provider/OpenAIProvider';
import { Tool } from '../../src/types/tool.types';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';
import { toolMocks } from '../utils/mocks/data.mock';
import { ExecuteToolModifiers } from '../../src/types/modifiers.types';

// Create mocks
vi.mock('openai', () => {
  return {
    OpenAI: vi.fn(),
  };
});

vi.mock('openai/streaming', () => {
  return {
    Stream: vi.fn(),
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  // Sample tool data
  beforeEach(() => {
    provider = new OpenAIProvider();

    // Mock the global execute tool function
    mockExecuteToolFn = vi.fn().mockResolvedValue({ result: 'success' });
    provider._setExecuteToolFn(mockExecuteToolFn);

    // Use the transformed tool mock from existing test utilities
    mockTool = {
      ...toolMocks.transformedTool,
      tags: [],
    } as Tool;
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
      const wrapped = provider.wrapTool(mockTool);

      expect(wrapped).toEqual({
        type: 'function',
        function: {
          name: mockTool.slug,
          description: mockTool.description,
          parameters: mockTool.inputParameters,
        },
      });
    });

    it('deduplicates required entries without mutating the input schema', () => {
      const tool = {
        ...mockTool,
        inputParameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            filters: {
              type: 'object',
              properties: { status: { type: 'string' } },
              required: ['status', 'status'],
            },
          },
          required: ['query', 'query'],
        },
      } as Tool;

      const wrapped = provider.wrapTool(tool);

      expect(wrapped.function.parameters).toMatchObject({
        required: ['query'],
        properties: { filters: { required: ['status'] } },
      });
      expect(tool.inputParameters).toMatchObject({
        required: ['query', 'query'],
        properties: { filters: { required: ['status', 'status'] } },
      });
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools', () => {
      const anotherTool = { ...mockTool, slug: 'another-tool' };
      const tools = [mockTool, anotherTool];

      const wrapped = provider.wrapTools(tools);

      expect(wrapped).toHaveLength(2);
      expect((wrapped[0] as OpenAI.ChatCompletionFunctionTool).function.name).toBe(mockTool.slug);
      expect((wrapped[1] as OpenAI.ChatCompletionFunctionTool).function.name).toBe(
        anotherTool.slug
      );
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
      } as OpenAI.ChatCompletionMessageFunctionToolCall;

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
      expect(result).toBe(JSON.stringify({ result: 'success' }));
    });

    it('should coerce empty-string arguments to an empty object (issue #2406)', async () => {
      const toolCall = {
        id: 'call-123',
        type: 'function',
        function: { name: 'test-tool', arguments: '' },
      } as OpenAI.ChatCompletionMessageFunctionToolCall;

      await provider.executeToolCall('test-user', toolCall);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        expect.objectContaining({ arguments: {} }),
        undefined
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
      } as OpenAI.ChatCompletionMessageFunctionToolCall;

      const options = {
        connectedAccountId: 'conn-123',
        customAuthParams: {
          parameters: [{ name: 'token', value: 'abc123', in: 'header' as const }],
        },
      };

      // Create a valid ExecuteToolModifiers object with beforeExecute and afterExecute functions
      const modifiers: ExecuteToolModifiers = {
        beforeExecute: vi.fn(({ toolSlug, toolkitSlug, params }) => {
          return {
            ...params,
            allowTracing: true,
          };
        }),
        afterExecute: vi.fn(({ toolSlug, toolkitSlug, result }) => {
          return result;
        }),
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
              refusal: null,
            },
            index: 0,
            finish_reason: 'tool_calls',
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

      const results = await provider.handleToolCalls(userId, chatCompletion);

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        userId,
        chatCompletion.choices[0].message.tool_calls![0],
        undefined,
        undefined
      );
      expect(results).toEqual([
        { role: 'tool', tool_call_id: 'call-123', content: JSON.stringify({ result: 'success' }) },
      ]);
    });

    it('should handle multiple parallel tool calls in a single message', async () => {
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
                    arguments: JSON.stringify({ input: 'first' }),
                  },
                } as const,
                {
                  id: 'call-456',
                  type: 'function',
                  function: {
                    name: 'other-tool',
                    arguments: JSON.stringify({ input: 'second' }),
                  },
                } as const,
              ],
              refusal: null,
            },
            index: 0,
            finish_reason: 'tool_calls',
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

      const results = await provider.handleToolCalls(userId, chatCompletion);

      // Every parallel tool call must be executed and answered, one tool message
      // per tool_call_id — otherwise the follow-up request errors on the unanswered ids.
      expect(executeToolCallSpy).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        { role: 'tool', tool_call_id: 'call-123', content: JSON.stringify({ result: 'success' }) },
        { role: 'tool', tool_call_id: 'call-456', content: JSON.stringify({ result: 'success' }) },
      ]);
    });

    it('should only handle tool calls from the first choice when n > 1', async () => {
      const userId = 'test-user';
      const makeChoice = (index: number, callId: string) => ({
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: callId,
              type: 'function',
              function: {
                name: 'test-tool',
                arguments: JSON.stringify({ input: 'value' }),
              },
            } as const,
          ],
          refusal: null,
        },
        index,
        finish_reason: 'tool_calls',
      });
      const chatCompletion = {
        id: 'chat-123',
        model: 'gpt-4',
        created: 123456789,
        object: 'chat.completion',
        // n > 1: alternative completions the caller never continues. Only the
        // first choice's tool calls should run; the rest would orphan their ids.
        choices: [makeChoice(0, 'call-first'), makeChoice(1, 'call-second')],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      } as OpenAI.ChatCompletion;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');
      executeToolCallSpy.mockResolvedValue(JSON.stringify({ result: 'success' }));

      const results = await provider.handleToolCalls(userId, chatCompletion);

      expect(executeToolCallSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        {
          role: 'tool',
          tool_call_id: 'call-first',
          content: JSON.stringify({ result: 'success' }),
        },
      ]);
    });
  });

  describe('handleAssistantMessage', () => {
    it('should handle assistant message with tool calls', async () => {
      const userId = 'test-user';
      // Cast to OpenAI.Beta.Threads.Run to bypass property requirements
      const run = {
        id: 'run-123',
        object: 'thread.run',
        status: 'requires_action',
        created_at: 123456789,
        thread_id: 'thread-123',
        assistant_id: 'asst-123',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call-123',
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
        run.required_action!.submit_tool_outputs!
          .tool_calls[0] as OpenAI.ChatCompletionMessageToolCall,
        undefined,
        undefined
      );
      expect(toolOutputs).toEqual([
        {
          tool_call_id: 'call-123',
          output: JSON.stringify(JSON.stringify({ result: 'success' })),
        },
      ]);
    });

    it('should handle run with no tool calls', async () => {
      const userId = 'test-user';
      const run = {
        id: 'run-123',
        object: 'thread.run',
        status: 'completed',
        created_at: 123456789,
        thread_id: 'thread-123',
        assistant_id: 'asst-123',
      } as unknown as OpenAI.Beta.Threads.Run;

      const executeToolCallSpy = vi.spyOn(provider, 'executeToolCall');

      const toolOutputs = await provider.handleAssistantMessage(userId, run);

      expect(executeToolCallSpy).not.toHaveBeenCalled();
      expect(toolOutputs).toEqual([]);
    });
  });

  describe('waitAndHandleAssistantToolCalls', () => {
    it('should handle assistant tool calls until complete', async () => {
      const userId = 'test-user';
      // Create a mock OpenAI client with the necessary functions
      const client = {
        beta: {
          threads: {
            runs: {
              retrieve: vi.fn(),
              submitToolOutputs: vi.fn(),
            },
          },
        },
      } as unknown as OpenAI;

      // Initial run requiring action
      const initialRun = {
        id: 'run-123',
        object: 'thread.run',
        status: 'requires_action',
        created_at: 123456789,
        thread_id: 'thread-123',
        assistant_id: 'asst-123',
        required_action: {
          type: 'submit_tool_outputs',
          submit_tool_outputs: {
            tool_calls: [
              {
                id: 'call-123',
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

      // Run after submitting tool outputs, now in progress
      const inProgressRun = {
        id: 'run-123',
        object: 'thread.run',
        status: 'in_progress',
        created_at: 123456789,
        thread_id: 'thread-123',
        assistant_id: 'asst-123',
      } as unknown as OpenAI.Beta.Threads.Run;

      // Final completed run
      const completedRun = {
        id: 'run-123',
        object: 'thread.run',
        status: 'completed',
        created_at: 123456789,
        thread_id: 'thread-123',
        assistant_id: 'asst-123',
      } as unknown as OpenAI.Beta.Threads.Run;

      const thread = {
        id: 'thread-123',
        object: 'thread',
        created_at: 123456789,
        metadata: {},
        tool_resources: {},
      } as unknown as OpenAI.Beta.Threads.Thread;

      // Mock the handleAssistantMessage method
      const handleAssistantMessageSpy = vi.spyOn(provider, 'handleAssistantMessage');
      handleAssistantMessageSpy.mockResolvedValue([
        {
          tool_call_id: 'call-123',
          output: JSON.stringify({ result: 'success' }),
        },
      ]);

      // Setup the client mock behavior
      client.beta.threads.runs.submitToolOutputs = vi.fn().mockResolvedValue(inProgressRun);
      client.beta.threads.runs.retrieve = vi
        .fn()
        .mockResolvedValueOnce(inProgressRun)
        .mockResolvedValue(completedRun);

      // Test the method
      const result = await provider.waitAndHandleAssistantToolCalls(
        userId,
        client,
        initialRun,
        thread
      );

      // Verify the behavior
      expect(handleAssistantMessageSpy).toHaveBeenCalledWith(
        userId,
        initialRun,
        undefined,
        undefined
      );
      expect(client.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith('run-123', {
        thread_id: 'thread-123',
        tool_outputs: [
          {
            tool_call_id: 'call-123',
            output: JSON.stringify({ result: 'success' }),
          },
        ],
      });
      expect(client.beta.threads.runs.retrieve).toHaveBeenCalledWith('run-123', {
        thread_id: 'thread-123',
      });
      expect(result).toEqual(completedRun);
    });
  });

  describe('waitAndHandleAssistantStreamToolCalls', () => {
    it('should handle streamed assistant tool calls', async () => {
      const userId = 'test-user';
      const client = {
        beta: {
          threads: {
            runs: {
              retrieve: vi.fn(),
              submitToolOutputs: vi.fn(),
            },
          },
        },
      } as unknown as OpenAI;

      const thread = {
        id: 'thread-123',
        object: 'thread',
        created_at: 123456789,
        metadata: {},
        tool_resources: {},
      } as unknown as OpenAI.Beta.Threads.Thread;

      // Mock events in the stream
      const mockEvents = [
        {
          event: 'thread.run.created',
          data: { id: 'run-123' },
        },
        {
          event: 'thread.run.requires_action',
          data: {
            id: 'run-123',
            status: 'requires_action',
            required_action: {
              type: 'submit_tool_outputs',
              submit_tool_outputs: {
                tool_calls: [
                  {
                    id: 'call-123',
                    type: 'function',
                    function: {
                      name: 'test-tool',
                      arguments: JSON.stringify({ input: 'test-value' }),
                    },
                  },
                ],
              },
            },
          },
        },
        {
          event: 'thread.run.completed',
          data: { id: 'run-123', status: 'completed' },
        },
      ];

      // Create a mock async iterator for the stream
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        },
      } as unknown as Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>;

      // Mock final run
      const finalRun = {
        id: 'run-123',
        object: 'thread.run',
        status: 'completed',
        created_at: 123456789,
        thread_id: 'thread-123',
        assistant_id: 'asst-123',
      } as unknown as OpenAI.Beta.Threads.Run;

      // Mock the handleAssistantMessage method
      const handleAssistantMessageSpy = vi.spyOn(provider, 'handleAssistantMessage');
      handleAssistantMessageSpy.mockResolvedValue([
        {
          tool_call_id: 'call-123',
          output: JSON.stringify({ result: 'success' }),
        },
      ]);

      // Setup the client mock behavior
      client.beta.threads.runs.submitToolOutputs = vi.fn().mockResolvedValue(finalRun);
      client.beta.threads.runs.retrieve = vi.fn().mockResolvedValue(finalRun);

      // Collect the yielded events
      const collectedEvents: any[] = [];
      for await (const event of provider.waitAndHandleAssistantStreamToolCalls(
        userId,
        client,
        mockStream,
        thread
      )) {
        collectedEvents.push(event);
      }

      // Verify the behavior
      expect(collectedEvents).toEqual(mockEvents);
      expect(handleAssistantMessageSpy).toHaveBeenCalledWith(
        userId,
        mockEvents[1].data,
        undefined,
        undefined
      );
      expect(client.beta.threads.runs.submitToolOutputs).toHaveBeenCalledWith('run-123', {
        thread_id: 'thread-123',
        tool_outputs: [
          {
            tool_call_id: 'call-123',
            output: JSON.stringify({ result: 'success' }),
          },
        ],
      });
    });
  });
});
