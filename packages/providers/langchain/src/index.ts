/**
 * Langchain Provider
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/langchain.ts
 *
 * This provider provides a set of tools for interacting with Langchain.
 *
 * @packageDocumentation
 * @module providers/langchain
 */
import { BaseAgenticProvider, jsonSchemaToModel, Tool, ExecuteToolFn } from '@composio/core';
import { DynamicStructuredTool } from '@langchain/core/tools';

export type LangChainToolCollection = Array<DynamicStructuredTool>;
export class LangchainProvider extends BaseAgenticProvider<
  LangChainToolCollection,
  DynamicStructuredTool
> {
  readonly name = 'langchain';
  /**
   * Abstract method to wrap a tool in the provider.
   * This method is implemented by the provider.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  wrapTool(tool: Tool, executeTool: ExecuteToolFn): DynamicStructuredTool {
    const toolName = tool.slug;
    const description = tool.description;
    const appName = tool.toolkit?.name?.toLowerCase();
    if (!appName) {
      throw new Error('App name is not defined');
    }
    const func = async (...args: unknown[]): Promise<unknown> => {
      const result = await executeTool(toolName, args[0] as Record<string, unknown>);
      return JSON.stringify(result);
    };
    if (!tool.inputParameters) {
      throw new Error('Tool input parameters are not defined');
    }
    const parameters = jsonSchemaToModel(tool.inputParameters);
    return new DynamicStructuredTool({
      name: toolName,
      description: description || '',
      schema: parameters,
      func: func,
    });
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): LangChainToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }
}
