/**
 * Langchain Toolset
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/langchain.ts
 *
 * This toolset provides a set of tools for interacting with Langchain.
 *
 * @packageDocumentation
 * @module toolsets/langchain
 */
import {
  BaseAgenticToolset,
  jsonSchemaToModel,
  Tool,
  ToolListParams,
  AgenticToolOptions,
} from '@composio/core';
import { DynamicStructuredTool } from '@langchain/core/tools';

export type LangChainToolCollection = Array<DynamicStructuredTool>;
export class LangchainToolset extends BaseAgenticToolset<
  LangChainToolCollection,
  DynamicStructuredTool
> {
  /**
   * Abstract method to wrap a tool in the toolset.
   * This method is implemented by the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  wrapTool(userId: string, tool: Tool, modifiers?: AgenticToolOptions): DynamicStructuredTool {
    const toolName = tool.slug;
    const description = tool.description;
    const appName = tool.toolkit?.name?.toLowerCase();
    if (!appName) {
      throw new Error('App name is not defined');
    }

    const func = async (...kwargs: unknown[]): Promise<unknown> => {
      const connectedAccountId = this.getComposio()?.getConnectedAccountId(appName);
      return JSON.stringify(
        await this.getComposio()?.tools.execute(
          toolName,
          {
            arguments: kwargs[0] as Record<string, unknown>,
            userId,
            connectedAccountId: connectedAccountId,
          },
          modifiers
        )
      );
    };
    if (!tool.inputParameters) {
      throw new Error('Tool input parameters are not defined');
    }
    const parameters = jsonSchemaToModel(tool.inputParameters);

    // @TODO: Add escriiption an other stuff here

    return new DynamicStructuredTool({
      name: toolName,
      description: description || '',
      schema: parameters,
      func: func,
    });
  }

  /**
   * Get all the tools from the Composio in Langchain format.
   * @param params - The parameters for the tool list.
   * @returns The tools.
   */
  override async getTools(
    userId: string,
    params?: ToolListParams,
    modifiers?: AgenticToolOptions
  ): Promise<LangChainToolCollection> {
    const tools = await this.getComposio()?.tools.getComposioTools(
      userId,
      params,
      modifiers?.modifyToolSchema
    );
    return tools?.map(tool => this.wrapTool(userId, tool, modifiers)) ?? [];
  }

  override async getToolBySlug(
    userId: string,
    slug: string,
    modifiers?: AgenticToolOptions
  ): Promise<DynamicStructuredTool> {
    const tool = await this.getComposio()?.tools.getComposioToolBySlug(
      userId,
      slug,
      modifiers?.modifyToolSchema
    );
    return this.wrapTool(userId, tool, modifiers);
  }
}
