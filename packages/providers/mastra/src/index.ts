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
import { MCPAuthOptions, MCPToolkitConfig, MCPGetServerParams } from '@composio/core/src/types/mcp.types';
import type { McpUrlResponse, McpServerCreateResponse } from '@composio/core/src/provider/BaseProvider';

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

  async create(
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<McpServerCreateResponse<MastraUrlMap>> {
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
      getServer: async (params: MCPGetServerParams): Promise<MastraUrlMap> => {
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
          params.user_id ? [params.user_id] : undefined
        );
      }
    };
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
