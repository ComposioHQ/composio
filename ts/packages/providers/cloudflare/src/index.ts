/**
 * Cloudflare AI Provider
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/cloudflare.ts
 *
 * This provider provides a set of tools for interacting with Cloudflare AI.
 *
 * @packageDocumentation
 * @module providers/cloudflare
 */
import { AiTextGenerationToolInput } from '@cloudflare/workers-types';
import {
  Tool,
  ExecuteToolModifiers,
  BaseNonAgenticProvider,
  ToolExecuteParams,
  ExecuteToolFnOptions,
  logger,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';

type AiToolCollection = Record<string, AiTextGenerationToolInput>;

/**
 * Cloudflare Workers AI tool definition
 */
export interface CloudflareTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Collection of Cloudflare Workers AI tools
 */
export type CloudflareToolCollection = CloudflareTool[];

/**
 * Cloudflare Workers AI function call interface
 */
export interface CloudflareFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export class CloudflareProvider extends BaseNonAgenticProvider<
  CloudflareToolCollection,
  CloudflareTool
> {
  readonly name = 'cloudflare';

  /**
   * Creates a new instance of the CloudflareProvider.
   *
   * This provider enables integration with Cloudflare AI,
   * allowing Composio tools to be used with Cloudflare Workers AI.
   *
   * @example
   * ```typescript
   *
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new CloudflareProvider()
   * });
   *
   * // Use the provider to wrap tools for Cloudflare AI
   * const cloudflareTools = provider.wrapTools(composioTools);
   * ```
   */
  constructor() {
    super();
    logger.debug('CloudflareProvider initialized');
  }

  /**
   * Transform MCP URL response into Cloudflare-specific format.
   * Cloudflare uses the standard format by default.
   *
   * @param data - The MCP URL response data
   * @param serverName - Name of the MCP server
   * @param connectedAccountIds - Optional array of connected account IDs
   * @param userIds - Optional array of user IDs
   * @param toolkits - Optional array of toolkit names
   * @returns Standard MCP server response format
   */
  transformMcpResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): McpServerGetResponse {
    // Cloudflare uses the standard format
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${connectedAccountIds[index]}`,
        toolkit: toolkits?.[index],
      })) as McpServerGetResponse;
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${userIds[index]}`,
        toolkit: toolkits?.[index],
      })) as McpServerGetResponse;
    }
    return {
      url: new URL(data.mcp_url),
      name: serverName,
    } as McpServerGetResponse;
  }

  /**
   * Wraps a Composio tool in the Cloudflare AI format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by Cloudflare's AI API for function calling.
   *
   * @param tool - The Composio tool to wrap
   * @returns The wrapped tool in Cloudflare AI format
   *
   * @example
   * ```typescript
   * // Wrap a single tool for use with Cloudflare AI
   * const composioTool = {
   *   slug: 'SEARCH_TOOL',
   *   description: 'Search for information',
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       query: { type: 'string', description: 'Search query' }
   *     },
   *     required: ['query']
   *   }
   * };
   *
   * const cloudflareTool = provider.wrapTool(composioTool);
   * ```
   */
  wrapTool(tool: Tool): CloudflareTool {
    return {
      name: tool.slug!,
      description: tool.description!,
      parameters: tool.inputParameters as unknown as {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
      },
    };
  }

  /**
   * Wraps a list of Composio tools in the Cloudflare AI format.
   *
   * This method transforms multiple Composio tool definitions into the format
   * expected by Cloudflare's AI API for function calling, organizing them
   * into a dictionary keyed by tool slug.
   *
   * @param tools - Array of Composio tools to wrap
   * @returns Dictionary of wrapped tools in Cloudflare AI format
   *
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Cloudflare AI
   * const composioTools = [
   *   {
   *     slug: 'SEARCH_TOOL',
   *     description: 'Search for information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         query: { type: 'string' }
   *       },
   *       required: ['query']
   *     }
   *   },
   *   {
   *     slug: 'WEATHER_TOOL',
   *     description: 'Get weather information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         location: { type: 'string' }
   *       },
   *       required: ['location']
   *     }
   *   }
   * ];
   *
   * const cloudflareTools = provider.wrapTools(composioTools);
   *
   * // Use with Cloudflare Workers AI
   * // In your Cloudflare Worker:
   * const ai = new Ai(env.AI);
   *
   * const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
   *   messages: [{ role: 'user', content: 'How is the weather in New York?' }],
   *   tools: cloudflareTools
   * });
   * ```
   */
  wrapTools(tools: Tool[]): CloudflareToolCollection {
    return tools.map(tool => ({
      name: tool.slug!,
      description: tool.description!,
      parameters: tool.inputParameters as unknown as {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
      },
    }));
  }

  /**
   * Executes a tool call from Cloudflare AI.
   *
   * This method processes a function call from Cloudflare's AI API,
   * executes the corresponding Composio tool, and returns the result.
   *
   * @param userId - The user ID for authentication and tracking
   * @param tool - The tool call object with name and arguments
   * @param options - Optional execution options like connected account ID
   * @param modifiers - Optional execution modifiers for tool behavior
   * @returns The result of the tool execution as a JSON string
   *
   * @example
   * ```typescript
   * // Execute a tool call from Cloudflare AI
   * const toolCall = {
   *   name: 'SEARCH_TOOL',
   *   arguments: {
   *     query: 'composio documentation'
   *   }
   * };
   *
   * const result = await provider.executeToolCall(
   *   'user123',
   *   toolCall,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Parse the result and use it in your application
   * const searchResults = JSON.parse(result);
   * console.log(searchResults);
   *
   * // You can also use the result to continue the conversation
   * // In your Cloudflare Worker:
   * const ai = new Ai(env.AI);
   *
   * await ai.run('@cf/meta/llama-3-8b-instruct', {
   *   messages: [
   *     { role: 'user', content: 'Search for Composio' },
   *     { role: 'assistant', content: '', tool_calls: [{ name: 'SEARCH_TOOL', arguments: JSON.stringify({ query: 'composio documentation' }) }] },
   *     { role: 'tool', tool_call_id: '1', content: result }
   *   ],
   *   tools: cloudflareTools
   * });
   * ```
   */
  async executeToolCall(
    userId: string,
    tool: CloudflareFunctionCall,
    options: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: tool.arguments,
      connectedAccountId: options.connectedAccountId,
      customAuthParams: options.customAuthParams,
      userId: userId,
    };

    const result = await this.executeTool(tool.name, payload, modifiers);
    return JSON.stringify(result);
  }
}
