/**
 * Vercel AI Toolset
 * To be used with the Vercel AI SDK
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/vercel.ts
 *
 * This toolset provides a set of tools for interacting with Vercel AI SDK.
 *
 * @packageDocumentation
 * @module toolsets/vercel
 */
import { BaseAgenticToolset, Tool as ComposioTool, ToolListParams } from '@composio/core';
import type { Tool as VercelTool } from 'ai';
import { jsonSchema, tool } from 'ai';
import {
  ExecuteToolModifiersParams,
  ModifiersParams,
} from 'packages/core/src/types/modifiers.types';

type VercelToolCollection = Record<string, VercelTool>;
export class VercelToolset extends BaseAgenticToolset<VercelToolCollection, VercelTool> {
  /**
   * Get all the tools from the client.
   * Override the default implementation to return a record of tools.
   *
   * @param params - The parameters for the tool list.
   * @param modifiers - The modifiers for the tool list.
   * @returns The tools.
   */
  override async getTools(
    params?: ToolListParams,
    modifiers?: ModifiersParams
  ): Promise<VercelToolCollection> {
    if (!this.getComposio()) {
      throw new Error('Client not initialized');
    }
    const tools = await this.getComposio().tools.getTools(params);
    return tools.reduce(
      (tools, tool) => ({
        ...tools,
        [tool.slug]: this.wrapTool(tool as ComposioTool, modifiers),
      }),
      {}
    );
  }

  override async getToolBySlug(slug: string, modifiers?: ModifiersParams): Promise<VercelTool> {
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this.wrapTool(tool as ComposioTool, modifiers);
  }

  /**
   * Execute a tool call.
   * @param tool - The tool to execute.
   * @param userId - The user id.
   * @returns {Promise<string>} The result of the tool call.
   */
  async executeToolCall(
    tool: { name: string; arguments: unknown },
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ): Promise<string> {
    if (!this.getComposio()) {
      throw new Error('Client not initialized');
    }

    const toolSchema = await this.getComposio().tools.getToolBySlug(tool.name);
    const appName = toolSchema?.name.toLowerCase();
    const args = typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments;

    const results = await this.getComposio().tools.execute(
      toolSchema.slug,
      {
        arguments: args,
        userId: userId ?? this.getComposio().userId,
        connectedAccountId: this.getComposio().getConnectedAccountId(appName),
      },
      modifiers
    );

    return JSON.stringify(results);
  }

  wrapTool(composioTool: ComposioTool, modifiers?: ExecuteToolModifiersParams): VercelTool {
    return tool({
      description: composioTool.description,
      parameters: jsonSchema(composioTool.inputParameters ?? {}),
      execute: async params => {
        return await this.executeToolCall(
          {
            name: composioTool.slug,
            arguments: JSON.stringify(params),
          },
          this.getComposio()?.userId,
          modifiers
        );
      },
    });
  }
}
