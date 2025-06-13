/**
 * Vercel AI Provider
 * To be used with the Vercel AI SDK
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/vercel.ts
 *
 * This provider provides a set of tools for interacting with Vercel AI SDK.
 *
 * @packageDocumentation
 * @module providers/vercel
 */
import { BaseAgenticProvider, Tool as ComposioTool, ExecuteToolFn } from '@composio/core';
import type { Tool as VercelTool } from 'ai';
import { jsonSchema, tool } from 'ai';
import { MCPToolkitConfig, MCPAuthOptions, MCPGetServerParams } from '@composio/core/src/types/mcp.types';
import { McpServerCreateResponse, McpUrlResponse, McpProvider } from '@composio/core/src/provider/BaseProvider';

type VercelToolCollection = Record<string, VercelTool>;

interface VercelMCPResponse {
  transport: "sse";
  url: URL;
}

export class VercelMcpProvider extends McpProvider<VercelMCPResponse[]> {
  readonly name = 'vercel';

  protected transformGetResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
  ): VercelMCPResponse[] {
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.map((url: string) => ({
        transport: "sse",
        url: new URL(url)
      }));
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.map((url: string) => ({
        transport: "sse",
        url: new URL(url)
      }));
    }
    return [{
      transport: "sse",
      url: new URL(data.mcp_url)
    }];
  }

  async create(
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<McpServerCreateResponse<VercelMCPResponse[]>> {
    if (!this.client) {
      throw new Error('Client not set');
    }

    // Check for unique toolkits
    const toolkits = toolkitConfigs.map(config => config.toolkit);
    const uniqueToolkits = new Set(toolkits);
    if (uniqueToolkits.size !== toolkits.length) {
      throw new Error('Duplicate toolkits are not allowed. Each toolkit must be unique.');
    }

    // Create a custom MCP server with the toolkit configurations
    const mcpServerCreatedResponse = await this.client.mcp.custom.create({
      name,
      toolkits: toolkits,
      custom_tools: toolkitConfigs.flatMap(config => config.allowedTools),
      managed_auth_via_composio: authOptions?.useManagedAuthByComposio || false,
      auth_config_ids: toolkitConfigs.map(config => config.authConfigId)
    });

    // Add getServer method to response
    return {
      ...mcpServerCreatedResponse,
      toolkits,
      getServer: async (params: MCPGetServerParams): Promise<VercelMCPResponse[]> => {
        if (!this.client) {
          throw new Error('Client not set');
        }

        // Validate that only one of user_id or connected_account_ids is provided
        if (params.user_id && params.connected_account_ids) {
          throw new Error('Cannot specify both user_id and connected_account_ids. Please provide only one.');
        }

        if (!params.user_id && !params.connected_account_ids) {
          throw new Error('Must provide either user_id or connected_account_ids.');
        }

        // If connected_account_ids is provided, verify toolkit names
        if (params.connected_account_ids) {
          const providedToolkits = Object.keys(params.connected_account_ids);
          const invalidToolkits = providedToolkits.filter(toolkit => !toolkits.includes(toolkit));
          if (invalidToolkits.length > 0) {
            throw new Error(`Invalid toolkits provided: ${invalidToolkits.join(', ')}. Available toolkits are: ${toolkits.join(', ')}`);
          }
        }

        const data = await this.client.mcp.generate.url({
          user_ids: params.user_id ? [params.user_id] : [],
          connected_account_ids: params.connected_account_ids ? Object.values(params.connected_account_ids) : [],
          mcp_server_id: mcpServerCreatedResponse.id,
          managed_auth_by_composio: authOptions?.useManagedAuthByComposio || false,
        });

        // Transform the response
        return this.transformGetResponse(
          data,
          mcpServerCreatedResponse.name,
          params.connected_account_ids ? Object.values(params.connected_account_ids) : undefined,
          params.user_id ? [params.user_id] : undefined,
        );
      }
    };
  }
}

export class VercelProvider extends BaseAgenticProvider<VercelToolCollection, VercelTool, VercelMCPResponse[]> {
  readonly name = 'vercel';

  readonly mcp = new VercelMcpProvider();

  /**
   * Creates a new instance of the VercelProvider.
   * 
   * This provider enables integration with the Vercel AI SDK,
   * allowing Composio tools to be used with Vercel AI applications.
   * 
   * @example
   * ```typescript
   * // Initialize the Vercel provider
   * const provider = new VercelProvider();
   * 
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new VercelProvider()
   * });
   * 
   * // Use the provider to wrap tools for Vercel AI SDK
   * const vercelTools = provider.wrapTools(composioTools, composio.tools.execute);
   * ```
   */
  constructor() {
    super();
  }

  /**
   * Wraps a Composio tool in a Vercel AI SDK tool format.
   * 
   * This method transforms a Composio tool definition into the format
   * expected by Vercel's AI SDK for function calling.
   * 
   * @param {ComposioTool} composioTool - The Composio tool to wrap
   * @param {ExecuteToolFn} executeTool - Function to execute the tool
   * @returns {VercelTool} The wrapped Vercel tool
   * 
   * @example
   * ```typescript
   * // Wrap a single tool for use with Vercel AI SDK
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
   * // Create a Vercel tool using the provider
   * const vercelTool = provider.wrapTool(
   *   composioTool,
   *   composio.tools.execute
   * );
   * 
   * // Use with Vercel AI SDK
   * import { StreamingTextResponse, Message } from 'ai';
   * import { OpenAI } from 'openai';
   * 
   * export async function POST(req: Request) {
   *   const { messages } = await req.json();
   *   const openai = new OpenAI();
   *   
   *   const response = await openai.chat.completions.create({
   *     model: 'gpt-4',
   *     messages,
   *     tools: [vercelTool]
   *   });
   *   
   *   return new StreamingTextResponse(response.choices[0].message);
   * }
   * ```
   */
  wrapTool(composioTool: ComposioTool, executeTool: ExecuteToolFn): VercelTool {
    return tool({
      description: composioTool.description,
      parameters: jsonSchema((composioTool.inputParameters as Record<string, unknown>) ?? {}),
      execute: async params => {
        const input = typeof params === 'string' ? JSON.parse(params) : params;
        return await executeTool(composioTool.slug, input);
      },
    });
  }

  /**
   * Wraps a list of Composio tools as a Vercel AI SDK tool collection.
   * 
   * This method transforms multiple Composio tool definitions into the format
   * expected by Vercel's AI SDK for function calling, organizing them
   * into a dictionary keyed by tool slug.
   * 
   * @param {ComposioTool[]} tools - Array of Composio tools to wrap
   * @param {ExecuteToolFn} executeTool - Function to execute the tools
   * @returns {VercelToolCollection} Dictionary of wrapped tools in Vercel AI SDK format
   * 
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Vercel AI SDK
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
   * // Create Vercel tools using the provider
   * const vercelTools = provider.wrapTools(
   *   composioTools,
   *   composio.tools.execute
   * );
   * 
   * // Use with Vercel AI SDK in a Next.js API route
   * import { StreamingTextResponse } from 'ai';
   * import { OpenAI } from 'openai';
   * 
   * export async function POST(req: Request) {
   *   const { messages } = await req.json();
   *   const openai = new OpenAI();
   *   
   *   const response = await openai.chat.completions.create({
   *     model: 'gpt-4',
   *     messages,
   *     tools: Object.values(vercelTools)
   *   });
   *   
   *   return new StreamingTextResponse(response.choices[0].message);
   * }
   * ```
   */
  wrapTools(tools: ComposioTool[], executeTool: ExecuteToolFn): VercelToolCollection {
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool, executeTool);
      return acc;
    }, {} as VercelToolCollection);
  }
}