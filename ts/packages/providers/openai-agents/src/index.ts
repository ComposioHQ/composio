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
  McpUrlResponse,
  McpServerGetResponse,
  McpServerUrlInfo,
} from '@composio/core';
import type { HostedMCPTool, Tool as OpenAIAgentTool } from '@openai/agents';
import { tool as createOpenAIAgentTool, hostedMcpTool } from '@openai/agents';

type OpenAIAgentsToolCollection = Array<OpenAIAgentTool>;
type TMcpExperimentalResponse = Array<HostedMCPTool<unknown>>;
export class OpenAIAgentsProvider extends BaseAgenticProvider<
  OpenAIAgentsToolCollection,
  OpenAIAgentTool,
  McpServerGetResponse,
  TMcpExperimentalResponse
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

  override wrapMcpServers(servers: McpServerGetResponse): TMcpExperimentalResponse {
    const prefixes = Object.keys(servers);

    function removePrefix(str: string): string {
      for (const prefix of prefixes) {
        if (str.startsWith(prefix)) {
          return str.slice(prefix.length + 1);
        }
      }
      return str;
    }

    function wrapMcpServer({ name, url }: McpServerUrlInfo) {
      return hostedMcpTool({
        serverLabel: removePrefix(name),
        serverUrl: url.toString(),
      })
    }

    if (Array.isArray(servers)) {
      return servers.map(server => wrapMcpServer(server))
    }

    return [wrapMcpServer(servers)];
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
      parameters: {
        type: 'object',
        properties: composioTool.inputParameters?.properties || {},
        required: composioTool.inputParameters?.required || [],
        additionalProperties: true,
      },
      strict: false,
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
