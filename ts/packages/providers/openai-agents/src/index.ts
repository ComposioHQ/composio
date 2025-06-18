/**
 * OpenAI Agents Provider
 * To be used with the @openai/agents package
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Reference: https://openai.github.io/openai-agents-js/
 *
 * This provider provides a set of tools for interacting with OpenAI's Agents API.
 *
 * @packageDocumentation
 * @module providers/openai-agents
 */
import {
  BaseAgenticProvider,
  Tool as ComposioTool,
  ExecuteToolFn,
  jsonSchemaToZodSchema,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';
import type { Tool as OpenAIAgentTool } from '@openai/agents';
import { tool as createOpenAIAgentTool } from '@openai/agents';

type OpenAIAgentsToolCollection = Array<OpenAIAgentTool>;
export class OpenAIAgentsProvider extends BaseAgenticProvider<
  OpenAIAgentsToolCollection,
  OpenAIAgentTool
> {
  readonly name = 'openai-agents';
  private strict: boolean | null;

  /**
   * Creates a new instance of the OpenAIAgentsProvider.
   *
   * This provider enables integration with the @openai/agents package,
   * allowing Composio tools to be used with OpenAI Agents.
   *
   * @example
   * ```typescript
   * // Initialize the OpenAIAgentsProvider
   * const provider = new OpenAIAgentsProvider();
   *
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new OpenAIAgentsProvider()
   * });
   *
   * // Use the provider to wrap tools for @openai/agents
   * const agentTools = provider.wrapTools(composioTools, composio.tools.execute);
   * ```
   */
  constructor(options?: { strict?: boolean }) {
    super();
    this.strict = options?.strict ?? false;
  }

  /**
   * Transform MCP URL response into OpenAI Agents-specific format.
   * OpenAI Agents uses the standard format by default.
   *
   * @param data - The MCP URL response data
   * @param serverName - Name of the MCP server
   * @param connectedAccountIds - Optional array of connected account IDs
   * @param userIds - Optional array of user IDs
   * @param toolkits - Optional array of toolkit names
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): McpServerGetResponse {
    // OpenAI Agents uses the standard format
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
   * Wraps a Composio tool in a OpenAI Agents tool format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by @openai/agents for function calling.
   *
   * @param {ComposioTool} composioTool - The Composio tool to wrap
   * @param {ExecuteToolFn} executeTool - Function to execute the tool
   * @returns {OpenAIAgentsTool} The wrapped OpenAI Agents tool
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
  wrapTool(composioTool: ComposioTool, executeTool: ExecuteToolFn): OpenAIAgentTool {
    return createOpenAIAgentTool({
      name: composioTool.slug,
      description: composioTool.description ?? '',
      parameters: jsonSchemaToZodSchema(
        (composioTool.inputParameters as Record<string, unknown>) ?? {},
        {
          strict: this.strict ? true : false,
        }
      ),
      execute: async params => {
        const input = typeof params === 'string' ? JSON.parse(params) : params;
        return await executeTool(composioTool.slug, input);
      },
    });
  }

  /**
   * Wraps a list of Composio tools as a OpenAI Agents tool collection.
   *
   * This method transforms multiple Composio tool definitions into the format
   * expected by OpenAI Agents for function calling, organizing them
   * into a dictionary keyed by tool slug.
   *
   * @param {ComposioTool[]} tools - Array of Composio tools to wrap
   * @param {ExecuteToolFn} executeTool - Function to execute the tools
   * @returns {OpenAIAgentsToolCollection} Dictionary of wrapped tools in OpenAI Agents format
   *
   * @example
   * ```typescript
   * // Get OpenAI Agents tools from Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new OpenAIAgentsProvider()
   * });
   *
   * const tools = await composio.tools.get('default', {
   *  toolkits: ['github'],
   * });
   *
   * import { OpenAI } from '@openai/agents';
   *
   * export async function POST(req: Request) {
   *   const { messages } = await req.json();
   *   const openai = new OpenAI();
   *
   *   const response = await openai.chat.completions.create({
   *     model: 'gpt-4',
   *     messages,
   *     tools: openaiAgentsTools
   *   });
   *
   *   return new StreamingTextResponse(response.choices[0].message);
   * }
   * ```
   */
  wrapTools(tools: ComposioTool[], executeTool: ExecuteToolFn): OpenAIAgentsToolCollection {
    return tools.map(tool => {
      return this.wrapTool(tool, executeTool);
    });
  }
}
