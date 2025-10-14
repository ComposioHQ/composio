/**
 * OpenAI Toolset
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/toolsets/openai.ts
 *
 * This provider provides a set of tools for interacting with OpenAI's ChatCompletions API.
 *
 * @packageDocumentation
 * @module providers/openai
 */
import { OpenAI } from 'openai';
import {
  BaseNonAgenticProvider,
  Tool,
  ToolExecuteParams,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  removeNonRequiredProperties,
  McpUrlResponse,
} from '@composio/core';

export type OpenAiTool = OpenAI.Responses.FunctionTool;
export type OpenAiMcpTool = OpenAI.Responses.Tool.Mcp;
export type OpenAiToolCollection = Array<OpenAiTool>;
export type OpenAIResponsesProviderOptions = {
  /**
   * Whether to use strict mode for function calls
   * @default false
   */
  strict?: boolean;
};

/**
 * OpenAI-specific MCP server response format
 */
export class OpenAIResponsesProvider extends BaseNonAgenticProvider<
  OpenAiToolCollection,
  OpenAiTool,
  OpenAiMcpTool[]
> {
  readonly name = 'openai';
  private strict: boolean | null;

  /**
   * Creates a new instance of the OpenAIProvider.
   *
   * This is the default provider for the Composio SDK and is automatically
   * available without additional installation.
   *
   * @param {OpenAIResponsesProviderOptions} [options] - Optional provider options
   * @returns {OpenAIResponsesProvider} The OpenAIResponsesProvider instance
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
   *   provider: new OpenAIResponsesProvider({
   *     strict: true // Optional, default is false
   *   })
   * });
   * ```
   */
  constructor(options?: OpenAIResponsesProviderOptions) {
    super();
    this.strict = options?.strict ?? false;
  }

  /**
   * Transform MCP URL response into OpenAI Responses-specific format.
   * OpenAI Responses uses a custom format with type, server_label, server_url, and require_approval fields.
   *
   * @param data - The MCP URL response data
   * @param serverName - Name of the MCP server
   * @returns OpenAI-specific MCP server response format
   */
  override wrapMcpServerResponse(data: McpUrlResponse): OpenAiMcpTool[] {
    console.log('Wrapping MCP server response', data);
    return data.map(item => ({
      type: 'mcp',
      server_label: item.name,
      server_url: item.url,
      require_approval: 'never',
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
  override wrapTool(tool: Tool): OpenAiTool {
    const inputParams = tool.inputParameters;

    const parameters =
      this.strict && inputParams?.type === 'object'
        ? removeNonRequiredProperties(
            inputParams as {
              type: 'object';
              properties: Record<string, unknown>;
              required?: string[];
            }
          )
        : (inputParams ?? {});

    return {
      name: tool.slug,
      description: tool.description,
      parameters,
      strict: this.strict,
      type: 'function',
    };
  }

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
    tool: OpenAI.Responses.ResponseFunctionToolCall,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: JSON.parse(tool.arguments),
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      customConnectionData: options?.customConnectionData,
      userId: userId,
    };
    const result = await this.executeTool(tool.name, payload, modifiers);
    return JSON.stringify(result);
  }

  /**
   * Handles tool calls from OpenAI's response.
   *
   * This method processes tool calls from an OpenAI response,
   * executes each tool call, and returns the results.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI.ChatCompletion} chatCompletion - The response from OpenAI
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {Promise<string[]>} Array of tool execution results as JSON strings
   *
   * @example
   * ```typescript
   * // Handle tool calls from a response
   * const response = await openai.responses.create({
   *   model: 'gpt-4o-2024-11-20',
   *   input: 'What is the capital of France?',
   *   tools: await composio.tools.get(composioTools)
   * });
   *
   * const inputItems = await composio.provider.handleToolCalls(
   *   'user123',
   *   response.output
   * );
   * console.log(inputItems); // Array of tool execution results
   *
   * // Submit tool outputs back to OpenAI
   * const response = await openai.responses.create({
   *   model: 'gpt-4o-2024-11-20',
   *   input: inputItems,
   *   tools: await composio.tools.get(composioTools),
   * });
   * ```
   * ```
   */
  async handleToolCalls(
    userId: string,
    toolCalls: OpenAI.Responses.ResponseOutputItem[],
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.Responses.ResponseInputItem.FunctionCallOutput[]> {
    const toolOutputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = [];
    for (const output of toolCalls) {
      if (output.type === 'function_call') {
        const tool_call = {
          id: output.id,
          name: output.name,
          arguments: output.arguments,
        } as OpenAI.Responses.ResponseFunctionToolCall;
        try {
          const toolOutput = await this.executeToolCall(userId, tool_call, options, modifiers);
          toolOutputs.push({
            call_id: output.call_id ?? '',
            type: 'function_call_output',
            output: toolOutput,
            // id: output.id ?? '',
            status: 'completed',
          });
        } catch (error) {
          toolOutputs.push({
            call_id: output.call_id ?? '',
            type: 'function_call_output',
            output: error instanceof Error ? error.message : 'Unknown error',
            // id: output.id ?? '',
            status: 'incomplete',
          });
        }
      }
    }
    return toolOutputs;
  }

  /**
   * Handles all the tool calls from the OpenAI Responses API.
   *
   * This method processes tool calls from an OpenAI Responses request,
   * executes each tool call, and returns the tool outputs for submission.
   *
   * @param {string} userId - The user ID for authentication and tracking
   * @param {OpenAI.Responses.Response} response - The Responses request object containing tool calls
   * @param {ExecuteToolFnOptions} [options] - Optional execution options
   * @param {ExecuteToolModifiers} [modifiers] - Optional execution modifiers
   * @returns {Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[]>} Array of tool outputs for submission
   *
   * @example
   * ```typescript
   * // Handle tool calls from an OpenAI response
   * const response = await openai.responses.create({
   *   model: 'gpt-4o-2024-11-20',
   *   input: 'What is the capital of France?',
   *   tools: await composio.tools.get(composioTools),
   *   tool_choice: 'auto',
   * });
   *
   * const inputItems = await composio.provider.handleResponse('default', response);
   *
   * // Submit tool outputs back to OpenAI
   * const response = await openai.responses.create({
   *   model: 'gpt-4o-2024-11-20',
   *   input: inputItems,
   *   tools: await composio.tools.get(composioTools),
   * });
   * ```
   */
  async handleResponse(
    userId: string,
    response: OpenAI.Responses.Response,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.Responses.ResponseInputItem.FunctionCallOutput[]> {
    const tool_calls = response.output?.filter(output => output.type === 'function_call') || [];
    const tool_outputs = await this.handleToolCalls(userId, tool_calls, options, modifiers);
    return tool_outputs;
  }
}
