/**
 * Mastra Provider
 *
 * This provider provides a set of tools for interacting with Mastra.ai
 *
 * @packageDocumentation
 * @module providers/mastra
 */
import { BaseAgenticProvider, Tool, ExecuteToolFn, jsonSchemaToModel } from '@composio/core';
import { createTool } from '@mastra/core';

export type MastraTool = ReturnType<typeof createTool>;

export interface MastraToolCollection {
  [key: string]: MastraTool;
}

export class MastraProvider extends BaseAgenticProvider<MastraToolCollection, MastraTool> {
  readonly name = 'mastra';

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): MastraTool {
    const mastraTool = createTool({
      id: tool.slug,
      description: tool.description ?? '',
      inputSchema: tool.inputParameters ? jsonSchemaToModel(tool.inputParameters) : undefined,
      outputSchema: tool.outputParameters ? jsonSchemaToModel(tool.outputParameters) : undefined,
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
