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
   * Transform MCP URL response into Anthropic-specific format.
   * By default, Anthropic uses the standard format (same as default),
   * but this method is here to show providers can customize if needed.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): MastraUrlMap {
    // Transform to Mastra's URL map format
    return data.reduce((acc: MastraUrlMap, item) => {
      acc[item.name] = { url: item.url };
      return acc;
    }, {});
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
