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
import { BaseNonAgenticProvider } from './BaseProvider';
import { Tool } from '../types/tool.types';
import { ExecuteToolModifiers } from '../types/modifiers.types';
import {
  ExecuteToolFnOptions,
  ToolCallExecutionTarget,
  ToolCallSession,
} from '../types/provider.types';
import { McpUrlResponse, McpServerGetResponse } from '../types/mcp.types';
import { normalizeToolArguments } from '../utils/toolArguments';
import { deduplicateJsonSchemaRequiredArrays } from '../utils/jsonSchema';

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
      parameters: deduplicateJsonSchemaRequiredArrays(tool.inputParameters),
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
   * @param {string | ToolCallSession} executionTarget - A user ID for direct tools or the session that produced session tools
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
    session: ToolCallSession,
    tool: OpenAI.ChatCompletionMessageFunctionToolCall
  ): Promise<string>;
  async executeToolCall(
    userId: string,
    tool: OpenAI.ChatCompletionMessageFunctionToolCall,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string>;
  async executeToolCall(
    executionTarget: ToolCallExecutionTarget,
    tool: OpenAI.ChatCompletionMessageFunctionToolCall,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    // OpenAI always serializes tool arguments as a JSON string; normalize tolerates
    // empty / object-shaped payloads too (issue #2406).
    const arguments_ = normalizeToolArguments(tool.function.arguments, tool.function.name);
    const result = await this.executeToolForTarget(
      executionTarget,
      tool.function.name,
      arguments_,
      options,
      modifiers
    );
    return JSON.stringify(result);
  }

  /**
   * Handles tool calls from OpenAI's chat completion response.
   *
   * This method processes tool calls from an OpenAI chat completion response,
   * executes each tool call, and returns the results.
   *
   * @param {string | ToolCallSession} executionTarget - A user ID for direct tools or the session that produced session tools
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
    session: ToolCallSession,
    chatCompletion: OpenAI.ChatCompletion
  ): Promise<OpenAI.ChatCompletionToolMessageParam[]>;
  async handleToolCalls(
    userId: string,
    chatCompletion: OpenAI.ChatCompletion,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.ChatCompletionToolMessageParam[]>;
  async handleToolCalls(
    executionTarget: ToolCallExecutionTarget,
    chatCompletion: OpenAI.ChatCompletion,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.ChatCompletionToolMessageParam[]> {
    this.assertToolCallExecutionOptions(executionTarget, options, modifiers);
    const outputs: OpenAI.ChatCompletionToolMessageParam[] = [];
    // Only the first choice is actionable: its tool results feed back into a
    // single assistant turn. With n > 1, iterating every choice would run each
    // tool call once per choice and orphan the tool_call_ids belonging to the
    // alternative completions.
    const [choice] = chatCompletion.choices;
    // A single assistant message can carry several tool calls (parallel tool
    // calls, on by default). Each one needs its own tool result, otherwise the
    // next request fails since some tool_call_ids go unanswered.
    for (const toolCall of choice?.message.tool_calls ?? []) {
      if (toolCall.type !== 'function') {
        continue;
      }
      const toolResult =
        typeof executionTarget === 'string'
          ? await this.executeToolCall(executionTarget, toolCall, options, modifiers)
          : await this.executeToolCall(executionTarget, toolCall);
      outputs.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
    return outputs;
  }
}
