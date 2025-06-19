/**
 * Anthropic Provider
 *
 * This provider provides a set of tools for interacting with Anthropic's API.
 * It implements the non-agentic provider interface for Anthropic's Claude models.
 *
 * @packageDocumentation
 * @module providers/anthropic
 */
import {
  BaseNonAgenticProvider,
  Tool as ComposioTool,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  ToolExecuteParams,
  logger,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicTool, InputSchema } from './types';

/**
 * Collection of Anthropic tools
 */
export type AnthropicToolCollection = AnthropicTool[];

/**
 * Type for Anthropic tool use block in message content
 */
export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Type for Anthropic message content block
 */
export type AnthropicContentBlock = {
  type: string;
  [key: string]: unknown;
};

/**
 * Anthropic Provider implementation for Composio
 */
export class AnthropicProvider extends BaseNonAgenticProvider<
  AnthropicToolCollection,
  AnthropicTool
> {
  readonly name = 'anthropic';
  private chacheTools: boolean = false;

  /**
   * Creates a new instance of the AnthropicProvider.
   *
   * @param {Object} [options] - Configuration options for the provider
   * @param {boolean} [options.cacheTools=false] - Whether to cache tools using Anthropic's ephemeral cache
   *
   * @example
   * ```typescript
   * // Initialize with default settings (no caching)
   * const provider = new AnthropicProvider();
   *
   * // Initialize with tool caching enabled
   * const providerWithCaching = new AnthropicProvider({
   *   cacheTools: true
   * });
   *
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new AnthropicProvider({
   *     cacheTools: true
   *   })
   * });
   * ```
   */
  constructor(options?: { cacheTools?: boolean }) {
    super();
    this.chacheTools = options?.cacheTools ?? false;
    logger.debug(`AnthropicProvider initialized [cacheTools: ${this.chacheTools}]`);
  }

  /**
   * Wraps a Composio tool in the Anthropic format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by Anthropic's Claude API for tool use.
   *
   * @param tool - The Composio tool to wrap
   * @returns The wrapped tool in Anthropic format
   *
   * @example
   * ```typescript
   * // Wrap a single tool for use with Anthropic
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
   * const anthropicTool = provider.wrapTool(composioTool);
   * ```
   */
  override wrapTool(tool: ComposioTool): AnthropicTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      input_schema: (tool.inputParameters || {
        type: 'object',
        properties: {},
        required: [],
      }) as InputSchema,
      cache_control: this.chacheTools ? { type: 'ephemeral' } : undefined,
    };
  }

  /**
   * Wraps a list of Composio tools in the Anthropic format.
   *
   * This method transforms multiple Composio tool definitions into the format
   * expected by Anthropic's Claude API for tool use.
   *
   * @param tools - Array of Composio tools to wrap
   * @returns Array of wrapped tools in Anthropic format
   *
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Anthropic
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
   * const anthropicTools = provider.wrapTools(composioTools);
   * ```
   */
  override wrapTools(tools: ComposioTool[]): AnthropicToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  /**
   * Executes a tool call from Anthropic's Claude API.
   *
   * This method processes a tool call from Anthropic's Claude API,
   * executes the corresponding Composio tool, and returns the result.
   *
   * @param userId - The user ID for authentication and tracking
   * @param toolUse - The tool use object from Anthropic
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns The result of the tool execution as a JSON string
   *
   * @example
   * ```typescript
   * // Execute a tool call from Anthropic
   * const toolUse = {
   *   type: 'tool_use',
   *   id: 'tu_abc123',
   *   name: 'SEARCH_TOOL',
   *   input: {
   *     query: 'composio documentation'
   *   }
   * };
   *
   * const result = await provider.executeToolCall(
   *   'user123',
   *   toolUse,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   * console.log(JSON.parse(result));
   * ```
   */
  async executeToolCall(
    userId: string,
    toolUse: AnthropicToolUseBlock,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: toolUse.input,
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      userId: userId,
    };
    const result = await this.executeTool(toolUse.name, payload, modifiers);
    return JSON.stringify(result.data);
  }

  /**
   * Handles tool calls from Anthropic's message response.
   *
   * This method processes tool calls from an Anthropic message response,
   * extracts the tool use blocks, executes each tool call, and returns the results.
   *
   * @param userId - The user ID for authentication and tracking
   * @param message - The message response from Anthropic
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns Array of tool execution results as JSON strings
   *
   * @example
   * ```typescript
   * // Handle tool calls from an Anthropic message response
   * const anthropic = new Anthropic({ apiKey: 'your-anthropic-api-key' });
   *
   * const message = await anthropic.messages.create({
   *   model: 'claude-3-opus-20240229',
   *   max_tokens: 1024,
   *   tools: provider.wrapTools(composioTools),
   *   messages: [
   *     {
   *       role: 'user',
   *       content: 'Search for information about Composio'
   *     }
   *   ]
   * });
   *
   * // Process any tool calls in the response
   * const results = await provider.handleToolCalls(
   *   'user123',
   *   message,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Use the results to continue the conversation
   * console.log(results);
   * ```
   */
  async handleToolCalls(
    userId: string,
    message: Anthropic.Message,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string[]> {
    const outputs: string[] = [];

    // Filter and map tool use blocks from message content
    const toolUseBlocks: AnthropicToolUseBlock[] = [];

    for (const content of message.content) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'type' in content &&
        typeof content.type === 'string' &&
        content.type.toString() === 'tool_use' &&
        'id' in content &&
        'name' in content &&
        'input' in content
      ) {
        toolUseBlocks.push({
          type: 'tool_use',
          id: String(content.id),
          name: String(content.name),
          input: content.input as Record<string, unknown>,
        });
      }
    }

    for (const toolUse of toolUseBlocks) {
      outputs.push(await this.executeToolCall(userId, toolUse, options, modifiers));
    }

    return outputs;
  }

  /**
   * Transform MCP URL response into Anthropic-specific format.
   * By default, Anthropic uses the standard format (same as default),
   * but this method is here to show providers can customize if needed.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    // Anthropic uses the standard format
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}
