/**
 * Claude Code Agents Provider
 * To be used with the Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
 *
 * This provider enables integration with Claude Code Agents SDK,
 * allowing Composio tools to be used as MCP tools within Claude agents.
 *
 * @packageDocumentation
 * @module providers/claude-code-agents
 */
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';
import {
  createSdkMcpServer,
  tool as sdkTool,
  type McpServerConfig,
  type Options as ClaudeAgentOptions,
} from '@anthropic-ai/claude-agent-sdk';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';

/**
 * Type for a single Claude Agent SDK MCP tool definition
 */
export type ClaudeAgentTool = ReturnType<typeof sdkTool>;

/**
 * Type for a collection of Claude Agent SDK MCP tools
 */
export type ClaudeAgentToolCollection = ClaudeAgentTool[];

/**
 * Type for the MCP server configuration returned by the provider
 */
export type ClaudeAgentMcpServerConfig = McpServerConfig;

/**
 * Options for the ClaudeCodeAgentsProvider
 */
export interface ClaudeCodeAgentsProviderOptions {
  /**
   * Name for the MCP server that will host Composio tools
   * @default 'composio'
   */
  serverName?: string;
  /**
   * Version for the MCP server
   * @default '1.0.0'
   */
  serverVersion?: string;
}

/**
 * Provider for integrating Composio tools with Claude Code Agents SDK.
 *
 * This provider wraps Composio tools as MCP tools that can be used with
 * the Claude Agent SDK's `query()` function via the `mcpServers` option.
 *
 * @example
 * ```typescript
 * import { Composio } from '@composio/core';
 * import { ClaudeCodeAgentsProvider } from '@composio/claude-code-agents';
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 *
 * const composio = new Composio({
 *   apiKey: process.env.COMPOSIO_API_KEY,
 *   provider: new ClaudeCodeAgentsProvider(),
 * });
 *
 * // Get tools and create MCP server config
 * const tools = await composio.tools.get('default', 'GMAIL_SEND_EMAIL');
 * const mcpServer = composio.provider.createMcpServer(tools, composio.tools.execute);
 *
 * // Use with Claude Agent SDK
 * for await (const message of query({
 *   prompt: 'Send an email to john@example.com',
 *   options: {
 *     mcpServers: { composio: mcpServer },
 *   },
 * })) {
 *   console.log(message);
 * }
 * ```
 */
export class ClaudeCodeAgentsProvider extends BaseAgenticProvider<
  ClaudeAgentToolCollection,
  ClaudeAgentTool,
  McpServerGetResponse
> {
  readonly name = 'claude-code-agents';
  private serverName: string;
  private serverVersion: string;

  /**
   * Creates a new instance of the ClaudeCodeAgentsProvider.
   *
   * @param options - Configuration options for the provider
   */
  constructor(options: ClaudeCodeAgentsProviderOptions = {}) {
    super();
    this.serverName = options.serverName ?? 'composio';
    this.serverVersion = options.serverVersion ?? '1.0.0';
  }

  /**
   * Wraps a Composio tool as a Claude Agent SDK MCP tool.
   *
   * @param composioTool - The Composio tool to wrap
   * @param executeTool - Function to execute the tool
   * @returns A Claude Agent SDK MCP tool definition
   *
   * @example
   * ```typescript
   * const composioTool = {
   *   slug: 'GMAIL_SEND_EMAIL',
   *   description: 'Send an email via Gmail',
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       to: { type: 'string', description: 'Recipient email' },
   *       subject: { type: 'string', description: 'Email subject' },
   *       body: { type: 'string', description: 'Email body' },
   *     },
   *     required: ['to', 'subject', 'body'],
   *   },
   * };
   *
   * const mcpTool = provider.wrapTool(composioTool, executeFn);
   * ```
   */
  wrapTool(composioTool: Tool, executeTool: ExecuteToolFn): ClaudeAgentTool {
    const inputParams = composioTool.inputParameters ?? {};
    const zodSchema = jsonSchemaToZod(inputParams);

    return sdkTool(
      composioTool.slug,
      composioTool.description ?? `Execute ${composioTool.slug}`,
      zodSchema,
      async args => {
        try {
          const result = await executeTool(composioTool.slug, args);
          return {
            content: [
              {
                type: 'text' as const,
                text: typeof result === 'string' ? result : (JSON.stringify(result) ?? ''),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  successful: false,
                  error: error instanceof Error ? error.message : String(error),
                  data: null,
                }),
              },
            ],
          };
        }
      }
    );
  }

  /**
   * Wraps multiple Composio tools as Claude Agent SDK MCP tools.
   *
   * @param tools - Array of Composio tools to wrap
   * @param executeTool - Function to execute the tools
   * @returns Array of Claude Agent SDK MCP tool definitions
   *
   * @example
   * ```typescript
   * const tools = await composio.tools.get('default', ['GMAIL_SEND_EMAIL', 'SLACK_POST_MESSAGE']);
   * const mcpTools = provider.wrapTools(tools, composio.tools.execute);
   * ```
   */
  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): ClaudeAgentToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }

  /**
   * Creates an MCP server configuration for use with Claude Agent SDK's `query()` function.
   *
   * This is the primary method for integrating Composio tools with Claude agents.
   * The returned configuration can be passed directly to the `mcpServers` option.
   *
   * @param wrappedTools - Array of wrapped Claude Agent SDK MCP tools (from composio.tools.get())
   * @returns MCP server configuration for Claude Agent SDK
   *
   * @example
   * ```typescript
   * const tools = await composio.tools.get('default', 'GMAIL_SEND_EMAIL');
   * const mcpServer = composio.provider.createMcpServer(tools);
   *
   * for await (const message of query({
   *   prompt: 'Send an email',
   *   options: {
   *     mcpServers: { composio: mcpServer },
   *   },
   * })) {
   *   console.log(message);
   * }
   * ```
   */
  createMcpServer(wrappedTools: ClaudeAgentToolCollection): ClaudeAgentMcpServerConfig {
    return createSdkMcpServer({
      name: this.serverName,
      version: this.serverVersion,
      tools: wrappedTools,
    });
  }

  /**
   * Transform MCP URL response into standard format.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}

/**
 * Re-export useful types from Claude Agent SDK for convenience
 */
export type { ClaudeAgentOptions };
