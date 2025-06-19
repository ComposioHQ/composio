/**
 * Mastra Provider
 *
 * This provider provides a set of tools for interacting with Mastra.ai
 *
 * @packageDocumentation
 * @module providers/mastra
 */
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  jsonSchemaToZodSchema,
  McpUrlResponse,
} from '@composio/core';
import { createTool } from '@mastra/core';

export type MastraTool = ReturnType<typeof createTool>;

export interface MastraToolCollection {
  [key: string]: MastraTool;
}

export interface MastraUrlMap {
  [name: string]: { url: string };
}

export class MastraProvider extends BaseAgenticProvider<
  MastraToolCollection,
  MastraTool,
  MastraUrlMap
> {
  readonly name = 'mastra';

  constructor() {
    super();
  }

  /**
   * Transform MCP URL response into Mastra-specific format.
   * Mastra expects URLs in a key-value map format.
   *
   * @param data - The MCP URL response data
   * @param serverName - Name of the MCP server
   * @param connectedAccountIds - Optional array of connected account IDs
   * @param userIds - Optional array of user IDs
   * @returns Transformed MastraUrlMap
   */
  wrapMcpServerResponse(data: McpUrlResponse, serverNames: string[]): MastraUrlMap {
    if (data.connected_account_urls) {
      return data.connected_account_urls.reduce(
        (prev: MastraUrlMap, url: string, index: number) => {
          prev[serverNames[index]] = {
            url: url,
          };
          return prev;
        },
        {}
      );
    } else if (data.user_ids_url) {
      return data.user_ids_url.reduce((prev: MastraUrlMap, url: string, index: number) => {
        prev[serverNames[index]] = {
          url: url,
        };
        return prev;
      }, {});
    }
    return {
      [serverNames[0]]: {
        url: data.mcp_url,
      },
    };
  }

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): MastraTool {
    const mastraTool = createTool({
      id: tool.slug,
      description: tool.description ?? '',
      inputSchema: tool.inputParameters ? jsonSchemaToZodSchema(tool.inputParameters) : undefined,
      outputSchema: tool.outputParameters
        ? jsonSchemaToZodSchema(tool.outputParameters)
        : undefined,
      execute: async ({ context }) => {
        const result = await executeTool(tool.slug, context);
        return result;
      },
    });

    return mastraTool;
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): MastraToolCollection {
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool, executeTool);
      return acc;
    }, {} as MastraToolCollection);
  }
}
