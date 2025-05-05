/**
 * Vercel AI Toolset
 * To be used with the Vercel AI SDK
 *
 * Author: @haxzie
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/vercel.ts
 *
 * This toolset provides a set of tools for interacting with Vercel AI SDK.
 *
 * @packageDocumentation
 * @module toolsets/vercel
 */
import { BaseComposioToolset, Tool as ComposioTool, ToolListParams } from '@composio/core';
import type { Tool as VercelTool } from 'ai';
import { jsonSchema, tool } from 'ai';

type VercelToolCollection = Record<string, VercelTool>;
export class VercelToolset extends BaseComposioToolset<VercelToolCollection, VercelTool> {
  readonly FILE_NAME = 'toolsets/vercel/src/index.ts';
  static readonly FRAMEWORK_NAME = 'vercel';

  /**
   * Get all the tools from the client.
   * Override the default implementation to return a record of tools.
   *
   * @param params - The parameters for the tool list.
   * @returns The tools.
   */
  override async getTools(params?: ToolListParams): Promise<VercelToolCollection> {
    if (!this.getComposio()) {
      throw new Error('Client not initialized');
    }
    const tools = await this.getComposio().tools.getTools(params);
    return tools.items.reduce(
      (tools, tool) => ({
        ...tools,
        [tool.slug]: this._wrapTool(tool as ComposioTool),
      }),
      {}
    );
  }

  /**
   * Execute a tool call.
   * @param tool - The tool to execute.
   * @param userId - The user id.
   * @returns {Promise<string>} The result of the tool call.
   */
  async executeToolCall(
    tool: { name: string; arguments: unknown },
    userId?: string
  ): Promise<string> {
    if (!this.getComposio()) {
      throw new Error('Client not initialized');
    }

    const toolSchema = await this.getComposio().tools.getToolBySlug(tool.name);
    const appName = toolSchema?.name.toLowerCase();
    const args = typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments;

    const results = await this.getComposio().tools.execute(toolSchema.slug, {
      arguments: args,
      userId: userId ?? this.getComposio().userId,
      connectedAccountId: this.getComposio().getConnectedAccountId(appName),
    });

    return JSON.stringify(results);
  }

  _wrapTool(composioTool: ComposioTool): VercelTool {
    return tool({
      description: composioTool.description,
      parameters: jsonSchema(composioTool.input_parameters ?? {}),
      execute: async params => {
        return await this.executeToolCall(
          {
            name: composioTool.slug,
            arguments: JSON.stringify(params),
          },
          this.getComposio()?.userId
        );
      },
    });
  }
}
