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
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  jsonSchemaToZodSchema,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';
import type { Tool as VercelTool } from 'ai';
import { jsonSchema, tool } from 'ai';
import { z } from 'zod';

export type VercelToolCollection = Record<string, VercelTool>;
export class VercelProvider extends BaseAgenticProvider<VercelToolCollection, VercelTool> {
  readonly name = 'vercel';

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
  wrapTool(composioTool: Tool, executeTool: ExecuteToolFn): VercelTool {
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
  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): VercelToolCollection {
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool, executeTool);
      return acc;
    }, {} as VercelToolCollection);
  }

  /**
   * Transform MCP URL response into Vercel-specific format.
   * Vercel uses the standard format by default.
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
    // Vercel uses the standard format
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
}
