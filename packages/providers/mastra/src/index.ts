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
import { BaseMcpProvider } from '@composio/core/src/provider/BaseProvider';
import { MCPCreateConfig, MCPAuthOptions } from '@composio/core/src/types/mcp.types';

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

export interface MastraCreateResponse {
  id: string;
  get: (params: MastraGetParams) => Promise<MastraUrlMap>;
}

export class MastraMcpProvider extends BaseMcpProvider {
  readonly name = 'mastra';

  async create(name: string, config: MCPCreateConfig, authOptions?: MCPAuthOptions): Promise<MastraCreateResponse> {
    const parentOutput = await super.create(name, config, authOptions);
    return {
      ...parentOutput,
      get: async (params: MastraGetParams): Promise<MastraUrlMap> => {
        const mcpServers = await parentOutput.get(params) as Array<{ url: string; name: string }>;

        return mcpServers.reduce((prev: MastraUrlMap, curr) => {
          prev[curr.name] = {
            url: new URL(curr.url),
          };
          return prev;
        }, {} as MastraUrlMap);
      }
    }
  }
}

export class MastraProvider extends BaseAgenticProvider<MastraToolCollection, MastraTool> {
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
