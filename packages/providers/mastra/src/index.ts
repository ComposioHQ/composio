/**
 * Mastra Provider
 *
 * This provider provides a set of tools for interacting with Mastra.ai
 *
 * @packageDocumentation
 * @module providers/mastra
 */
import { BaseAgenticProvider, Tool, ExecuteToolFn, jsonSchemaToZodSchema } from '@composio/core';
import { createTool } from '@mastra/core';
import { McpProvider } from '@composio/core/src/provider/BaseProvider';
import { MCPCreateConfig, MCPAuthOptions } from '@composio/core/src/types/mcp.types';
import type { McpServerCreateResponse, McpUrlResponse } from '@composio/core/src/provider/BaseProvider';

export type MastraTool = ReturnType<typeof createTool>;

export interface MastraToolCollection {
  [key: string]: MastraTool;
}

export interface MastraGetParams {
  userIds?: string[];
  connectedAccountIds?: string[];
}

export interface MastraUrlMap {
  [name: string]: { url: URL; }
}

export class MastraMcpProvider extends McpProvider<MastraUrlMap> {
  readonly name = 'mastra';

  protected transformGetResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[]
  ): MastraUrlMap {
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.reduce((prev: MastraUrlMap, url: string, index: number) => {
        prev[`${serverName}-${connectedAccountIds[index]}`] = {
          url: new URL(url),
        };
        return prev;
      }, {});
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.reduce((prev: MastraUrlMap, url: string, index: number) => {
        prev[`${serverName}-${userIds[index]}`] = {
          url: new URL(url),
        };
        return prev;
      }, {});
    }
    return {
      [serverName]: {
        url: new URL(data.mcp_url),
      },
    };
  }

  async create(name: string, config: MCPCreateConfig, authOptions?: MCPAuthOptions): Promise<McpServerCreateResponse<MastraUrlMap>> {
    return super.create(name, config, authOptions);
  }
}

export class MastraProvider extends BaseAgenticProvider<MastraToolCollection, MastraTool, MastraUrlMap> {
  readonly name = 'mastra';

  readonly mcp = new MastraMcpProvider();

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
