/**
 * LiveKit Agents Provider
 * To be used with the LiveKit Agents SDK (@livekit/agents)
 *
 * This provider enables integration with LiveKit Agents SDK,
 * allowing Composio tools to be used as LLM tools within LiveKit voice agents.
 *
 * @packageDocumentation
 * @module providers/livekit
 */
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  McpUrlResponse,
  McpServerGetResponse,
  jsonSchemaToZodSchema,
} from '@composio/core';
import { llm } from '@livekit/agents';

/**
 * Type for a single LiveKit Agent tool definition
 * Using `any` to avoid symbol mismatch issues across different @livekit/agents package instances
 * Users should use `llm.ToolContext` from their own @livekit/agents installation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LivekitTool = any;

/**
 * Type for a collection of LiveKit Agent tools
 * Using `any` to avoid symbol mismatch issues across different @livekit/agents package instances
 * Users should use `llm.ToolContext` from their own @livekit/agents installation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LivekitToolCollection = Record<string, any>;

/**
 * Provider for integrating Composio tools with LiveKit Agents SDK.
 *
 * This provider wraps Composio tools as LLM tools that can be used with
 * the LiveKit Agents SDK's `voice.Agent` class.
 *
 * @example
 * ```typescript
 * import { Composio } from '@composio/core';
 * import { LivekitProvider } from '@composio/livekit';
 * import { voice } from '@livekit/agents';
 *
 * const composio = new Composio({
 *   apiKey: process.env.COMPOSIO_API_KEY,
 *   provider: new LivekitProvider(),
 * });
 *
 * // Get tools wrapped for LiveKit
 * const tools = await composio.tools.get('default', ['GMAIL_SEND_EMAIL', 'SLACK_POST_MESSAGE']);
 *
 * // Use with LiveKit Agent
 * const agent = new voice.Agent({
 *   instructions: 'You are a helpful assistant.',
 *   tools,
 * });
 * ```
 */
export class LivekitProvider extends BaseAgenticProvider<
  LivekitToolCollection,
  LivekitTool,
  McpServerGetResponse
> {
  readonly name = 'livekit';

  /**
   * Wraps a Composio tool as a LiveKit Agent LLM tool.
   *
   * @param composioTool - The Composio tool to wrap
   * @param executeTool - Function to execute the tool
   * @returns A LiveKit Agent LLM tool definition
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
   * const livekitTool = provider.wrapTool(composioTool, executeFn);
   * ```
   */
  wrapTool(composioTool: Tool, executeTool: ExecuteToolFn): LivekitTool {
    const inputParams = composioTool.inputParameters ?? {};

    const parameters = jsonSchemaToZodSchema(inputParams);

    return llm.tool({
      description: composioTool.description ?? `Execute ${composioTool.slug}`,
      parameters,
      execute: async (args: Record<string, unknown>) => {
        try {
          const result = await executeTool(composioTool.slug, args as Record<string, unknown>);
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
          return JSON.stringify({
            successful: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      },
    });
  }

  /**
   * Wraps multiple Composio tools as LiveKit Agent LLM tools.
   *
   * @param tools - Array of Composio tools to wrap
   * @param executeTool - Function to execute the tools
   * @returns Record of LiveKit Agent LLM tool definitions keyed by tool name (camelCase)
   *
   * @example
   * ```typescript
   * const tools = await composio.tools.get('default', ['GMAIL_SEND_EMAIL', 'SLACK_POST_MESSAGE']);
   * // Returns: { gmailSendEmail: LivekitTool, slackPostMessage: LivekitTool }
   * ```
   */
  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): llm.ToolContext {
    const result: LivekitToolCollection = {};
    for (const tool of tools) {
      // Convert slug to camelCase for LiveKit tool naming convention
      const toolName = this.slugToCamelCase(tool.slug);
      result[toolName] = this.wrapTool(tool, executeTool);
    }
    return result;
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

  /**
   * Converts a SCREAMING_SNAKE_CASE slug to camelCase.
   * Example: GMAIL_SEND_EMAIL -> gmailSendEmail
   *
   * @param slug - The slug to convert
   * @returns The camelCase version of the slug
   */
  private slugToCamelCase(slug: string): string {
    return slug.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
