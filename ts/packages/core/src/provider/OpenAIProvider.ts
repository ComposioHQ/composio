/**
 * OpenAI ToolSet
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/toolsets/openai.ts
 *
 * This is a default provider for Composio SDK.
 * This will be shipped with the SDK and users don't need to install it separately.
 */
import { OpenAI } from 'openai';
import { Stream } from 'openai/core/streaming';
import { BaseNonAgenticProvider } from './BaseProvider';
import { Tool, ToolExecuteParams } from '../types/tool.types';
import logger from '../utils/logger';
import { ExecuteToolModifiers } from '../types/modifiers.types';
import { ExecuteToolFnOptions } from '../types/provider.types';
import { McpUrlResponse, McpServerGetResponse } from '../types/mcp.types';

export type OpenAiTool = OpenAI.ChatCompletionTool;
export type OpenAiToolCollection = Array<OpenAiTool>;

export class OpenAIProvider extends BaseNonAgenticProvider<
  OpenAiToolCollection,
  OpenAiTool,
  McpServerGetResponse
> {
  readonly name = 'openai';

  /**
   * Creates a new instance of the OpenAIProvider.
   *
   * This is the default provider for the Composio SDK and is automatically
   * available without additional installation.
   *
   * @example
   * ```typescript
   * // The OpenAIProvider is used by default when initializing Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key'
   * });
   *
   * // You can also explicitly specify it
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new OpenAIProvider()
   * });
   * ```
   */
  constructor() {
    super();
  }

  /**
   * Transform MCP URL response into OpenAI-specific format.
   * OpenAI uses the standard format by default.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  override wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    }));
  }

  /**
   * Wraps a Composio tool in the OpenAI function calling format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by OpenAI's function calling API.
   *
   * @param tool - The Composio tool to wrap
   * @returns The wrapped tool in OpenAI format
   *
   * @example
   * ```typescript
   * // Wrap a single tool for use with OpenAI
   * const composioTool = {
   *   slug: 'SEARCH_TOOL',
   *   description: 'Search for information',
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       query: { type: 'string' }
   *     },
   *     required: ['query']
   *   }
   * };
   *
   * const openAITool = provider.wrapTool(composioTool);
   * ```
   */
  override wrapTool = (tool: Tool): OpenAiTool => {
    const formattedSchema: OpenAI.FunctionDefinition = {
      name: tool.slug,
      description: tool.description,
      parameters: tool.inputParameters,
    };
    return {
      type: 'function',
      function: formattedSchema,
    };
  };

  /**
   * Wraps multiple Composio tools in the OpenAI function calling format.
   *
   * This method transforms a list of Composio tools into the format
   * expected by OpenAI's function calling API.
   *
   * @param tools - Array of Composio tools to wrap
   * @returns Array of wrapped tools in OpenAI format
   *
   * @example
   * ```typescript
   * // Wrap multiple tools for use with OpenAI
   * const composioTools = [
   *   {
   *     slug: 'SEARCH_TOOL',
   *     description: 'Search for information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         query: { type: 'string' }
   *       }
   *     }
   *   },
   *   {
   *     slug: 'WEATHER_TOOL',
   *     description: 'Get weather information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         location: { type: 'string' }
   *       }
   *     }
   *   }
   * ];
   *
   * const openAITools = provider.wrapTools(composioTools);
   * ```
   */
  override wrapTools = (tools: Tool[]): OpenAiToolCollection => {
    return tools.map(tool => this.wrapTool(tool));
  };

  /**
   * Executes a tool call from OpenAI's chat completion.
   *
   * This method processes a tool call from OpenAI's chat completion API,
   * executes the corresponding Composio tool, and returns the result.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI.ChatCompletionMessageToolCall} tool - The tool call from OpenAI
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {Promise<string>} The result of the tool call as a JSON string
   *
   * @example
   * ```typescript
   * // Execute a tool call from OpenAI
   * const toolCall = {
   *   id: 'call_abc123',
   *   type: 'function',
   *   function: {
   *     name: 'SEARCH_TOOL',
   *     arguments: '{"query":"composio documentation"}'
   *   }
   * };
   *
   * const result = await provider.executeToolCall(
   *   'user123',
   *   toolCall,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   * console.log(JSON.parse(result));
   * ```
   */
  async executeToolCall(
    userId: string,
    tool: OpenAI.ChatCompletionMessageFunctionToolCall,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: JSON.parse(tool.function.arguments),
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      customConnectionData: options?.customConnectionData,
      userId: userId,
    };
    const result = await this.executeTool(tool.function.name, payload, modifiers);
    return JSON.stringify(result);
  }

  /**
   * Handles tool calls from OpenAI's chat completion response.
   *
   * This method processes tool calls from an OpenAI chat completion response,
   * executes each tool call, and returns the results.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI.ChatCompletion} chatCompletion - The chat completion response from OpenAI
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {Promise<string[]>} Array of tool execution results as JSON strings
   *
   * @example
   * ```typescript
   * // Handle tool calls from a chat completion response
   * const chatCompletion = {
   *   choices: [
   *     {
   *       message: {
   *         tool_calls: [
   *           {
   *             id: 'call_abc123',
   *             type: 'function',
   *             function: {
   *               name: 'SEARCH_TOOL',
   *               arguments: '{"query":"composio documentation"}'
   *             }
   *           }
   *         ]
   *       }
   *     }
   *   ]
   * };
   *
   * const results = await provider.handleToolCalls(
   *   'user123',
   *   chatCompletion,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   * console.log(results); // Array of tool execution results
   * ```
   */
  async handleToolCalls(
    userId: string,
    chatCompletion: OpenAI.ChatCompletion,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.ChatCompletionToolMessageParam[]> {
    const outputs: OpenAI.ChatCompletionToolMessageParam[] = [];
    for (const message of chatCompletion.choices) {
      if (message.message.tool_calls && message.message.tool_calls[0].type === 'function') {
        const toolResult = await this.executeToolCall(
          userId,
          message.message.tool_calls[0],
          options,
          modifiers
        );
        outputs.push({
          role: 'tool',
          tool_call_id: message.message.tool_calls[0].id,
          content: toolResult,
        });
      }
    }
    return outputs;
  }

  /**
   * Handles all the tool calls from the OpenAI Assistant API.
   *
   * This method processes tool calls from an OpenAI Assistant run,
   * executes each tool call, and returns the tool outputs for submission.
   *
   * @deprecated Assistant API is deprecated, please use responses or chat completions instead. This method will be removed in the next major version.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI.Beta.Threads.Run} run - The Assistant run object containing tool calls
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[]>} Array of tool outputs for submission
   *
   *
   * @example
   * ```typescript
   * // Handle tool calls from an OpenAI Assistant run
   * const run = {
   *   id: 'run_abc123',
   *   required_action: {
   *     submit_tool_outputs: {
   *       tool_calls: [
   *         {
   *           id: 'call_xyz789',
   *           type: 'function',
   *           function: {
   *             name: 'SEARCH_TOOL',
   *             arguments: '{"query":"composio documentation"}'
   *           }
   *         }
   *       ]
   *     }
   *   }
   * };
   *
   * const toolOutputs = await provider.handleAssistantMessage(
   *   'user123',
   *   run,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Submit tool outputs back to OpenAI
   * await openai.beta.threads.runs.submitToolOutputs(
   *   thread.id,
   *   run.id,
   *   { tool_outputs: toolOutputs }
   * );
   * ```
   */
  async handleAssistantMessage(
    userId: string,
    run: OpenAI.Beta.Threads.Run,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ) {
    const tool_calls = run.required_action?.submit_tool_outputs?.tool_calls || [];
    const tool_outputs: Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput> =
      await Promise.all(
        tool_calls.map(async tool_call => {
          logger.debug(`Executing tool call: ${tool_call.id}`);

          // Execute each tool call and get the response
          const tool_response = await this.executeToolCall(
            userId,
            tool_call as OpenAI.ChatCompletionMessageFunctionToolCall,
            options,
            modifiers
          );

          logger.debug(`Tool call ${tool_call.id} executed with response: ${tool_response}`);

          return {
            tool_call_id: tool_call.id,
            output: JSON.stringify(tool_response),
          };
        })
      );
    return tool_outputs;
  }

  /**
   * Waits for the assistant stream and handles the tool calls.
   *
   * This method processes an OpenAI Assistant stream, handles any tool calls
   * that require action, and yields each event from the stream. It's designed
   * for streaming Assistant responses while handling tool calls in real-time.
   *
   * @deprecated Assistant API is deprecated, please use responses or chat completions instead. It will be removed in the next major version.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI} client - The OpenAI client instance
   * @param {Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>} runStream - The Assistant run stream
   * @param {OpenAI.Beta.Threads.Thread} thread - The thread object
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {AsyncGenerator<OpenAI.Beta.Assistants.AssistantStreamEvent, void, unknown>} Generator yielding stream events
   *
   *
   *
   * @example
   * ```typescript
   * // Process an OpenAI Assistant stream with tool calls
   * const thread = await openai.beta.threads.create();
   * const runStream = openai.beta.threads.runs.stream(thread.id, {
   *   assistant_id: 'asst_abc123',
   *   tools: provider.wrapTools(composioTools)
   * });
   *
   * // Process the stream and handle tool calls
   * const streamProcessor = provider.waitAndHandleAssistantStreamToolCalls(
   *   'user123',
   *   openai,
   *   runStream,
   *   thread,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Consume the stream events
   * for await (const event of streamProcessor) {
   *   if (event.event === 'thread.message.delta') {
   *     console.log(event.data.delta.content);
   *   }
   * }
   * ```
   */
  async *waitAndHandleAssistantStreamToolCalls(
    userId: string,
    client: OpenAI,
    runStream: Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>,
    thread: OpenAI.Beta.Threads.Thread,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ) {
    // @TODO: Log the run stream
    let runId = null;

    // Start processing the runStream events
    for await (const event of runStream) {
      yield event; // Yield each event from the stream as it arrives

      if (event.event === 'thread.run.created') {
        const { id } = event.data;
        runId = id;
      }

      if (!runId) {
        continue;
      }

      // Handle the 'requires_action' event
      if (event.event === 'thread.run.requires_action') {
        const toolOutputs = await this.handleAssistantMessage(
          userId,
          event.data,
          options,
          modifiers
        );

        // Submit the tool outputs
        await client.beta.threads.runs.submitToolOutputs(runId, {
          thread_id: thread.id,
          tool_outputs: toolOutputs,
        });
      }

      // Break if the run status becomes inactive
      if (
        [
          'thread.run.completed',
          'thread.run.failed',
          'thread.run.cancelled',
          'thread.run.expired',
        ].includes(event.event)
      ) {
        break;
      }
    }

    if (!runId) {
      throw new Error('No run ID found');
    }

    // Handle any final actions after the stream ends
    let finalRun = await client.beta.threads.runs.retrieve(runId, {
      thread_id: thread.id,
    });

    while (['queued', 'in_progress', 'requires_action'].includes(finalRun.status)) {
      if (finalRun.status === 'requires_action') {
        const toolOutputs = await this.handleAssistantMessage(userId, finalRun, options, modifiers);

        // Submit tool outputs
        finalRun = await client.beta.threads.runs.submitToolOutputs(runId, {
          thread_id: thread.id,
          tool_outputs: toolOutputs,
        });
      } else {
        // Update the run status
        finalRun = await client.beta.threads.runs.retrieve(runId, {
          thread_id: thread.id,
        });
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait before rechecking
      }
    }
  }

  /**
   * Waits for the assistant tool calls and handles them.
   *
   * This method polls an OpenAI Assistant run until it completes or requires action,
   * handles any tool calls, and returns the final run object. It's designed for
   * non-streaming Assistant interactions.
   *
   * @deprecated Assistant API is deprecated, please use responses or chat completions instead. It will be removed in the next major version.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI} client - The OpenAI client instance
   * @param {OpenAI.Beta.Threads.Run} run - The initial run object
   * @param {OpenAI.Beta.Threads.Thread} thread - The thread object
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {Promise<OpenAI.Beta.Threads.Run>} The final run object after completion
   *
   * @example
   * ```typescript
   * // Process an OpenAI Assistant run with tool calls
   * const thread = await openai.beta.threads.create();
   * await openai.beta.threads.messages.create(thread.id, {
   *   role: 'user',
   *   content: 'Find information about Composio'
   * });
   *
   * let run = await openai.beta.threads.runs.create(thread.id, {
   *   assistant_id: 'asst_abc123',
   *   tools: provider.wrapTools(composioTools)
   * });
   *
   * // Wait for the run to complete, handling any tool calls
   * run = await provider.waitAndHandleAssistantToolCalls(
   *   'user123',
   *   openai,
   *   run,
   *   thread,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Get the final messages after run completion
   * const messages = await openai.beta.threads.messages.list(thread.id);
   * console.log(messages.data[0].content);
   * ```
   */
  async waitAndHandleAssistantToolCalls(
    userId: string,
    client: OpenAI,
    run: OpenAI.Beta.Threads.Run,
    thread: OpenAI.Beta.Threads.Thread,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ) {
    while (['queued', 'in_progress', 'requires_action'].includes(run.status)) {
      // logger.debug(`Current run status: ${run.status}`);
      const tool_outputs = await this.handleAssistantMessage(userId, run, options, modifiers);
      if (run.status === 'requires_action') {
        // logger.debug(
        //   `Submitting tool outputs for run ID: ${run.id} in thread ID: ${thread.id}`
        // );
        run = await client.beta.threads.runs.submitToolOutputs(run.id, {
          thread_id: thread.id,
          tool_outputs: tool_outputs,
        });
      } else {
        run = await client.beta.threads.runs.retrieve(run.id, {
          thread_id: thread.id,
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return run;
  }
}
