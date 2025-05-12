/**
 * Cloudflare AI Toolset
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/cloudflare.ts
 *
 * This toolset provides a set of tools for interacting with Cloudflare AI.
 *
 * @packageDocumentation
 * @module toolsets/cloudflare
 */
import { AiTextGenerationToolInput } from '@cloudflare/workers-types';
import { BaseNonAgenticToolset, Tool, ToolListParams } from '@composio/core';
import {
  ExecuteToolModifiersParams,
  ModifiersParams,
} from 'packages/core/src/types/modifiers.types';

type AiToolCollection = Record<string, AiTextGenerationToolInput>;

export class CloudflareToolset extends BaseNonAgenticToolset<
  AiToolCollection,
  AiTextGenerationToolInput
> {
  /**
   * Abstract method to wrap a tool in the toolset.
   * This method is implemented by the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  _wrapTool(tool: Tool): AiTextGenerationToolInput {
    const formattedSchema: AiTextGenerationToolInput['function'] = {
      name: tool.slug!,
      description: tool.description!,
      parameters: tool.inputParameters as unknown as {
        type: 'object';
        properties: {
          [key: string]: {
            type: string;
            description?: string;
          };
        };
        required: string[];
      },
    };
    const cloudflareTool: AiTextGenerationToolInput = {
      type: 'function',
      function: formattedSchema,
    };
    return cloudflareTool;
  }

  /**
   * Get all the tools from the Cloudflare API.
   * @param {ToolListParams} query - The query parameters for the tools.
   * @returns {Promise<Record<string, AiTextGenerationToolInput>>} The tools from the Cloudflare API.
   */
  override async getTools(
    query?: ToolListParams,
    modifiers?: Pick<ModifiersParams, 'schema'>
  ): Promise<AiToolCollection> {
    if (!this.getComposio()) {
      throw new Error('Client not set');
    }

    const tools = await this.getComposio().tools.getTools(query, modifiers?.schema);
    return tools.reduce(
      (tools, tool) => ({
        ...tools,
        [tool.slug]: this._wrapTool(tool),
      }),
      {}
    );
  }

  override async getToolBySlug(
    slug: string,
    modifiers?: Pick<ModifiersParams, 'schema'>
  ): Promise<AiTextGenerationToolInput> {
    if (!this.getComposio()) {
      throw new Error('Client not set');
    }
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this._wrapTool(tool);
  }

  /**
   * Execute a tool call.
   * @param tool - The tool to execute.
   * @param userId - The user id.
   * @returns The results of the tool call.
   */
  async executeToolCall(
    tool: { name: string; arguments: unknown },
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ): Promise<string> {
    if (!this.getComposio()) {
      throw new Error('Client not set');
    }

    const toolSchema = await this.getComposio().tools.getToolBySlug(tool.name);
    const appName = toolSchema?.toolkit?.name.toLowerCase();
    if (!appName) {
      throw new Error('App name not found');
    }
    const args = typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments;
    const results = await this.getComposio()?.tools.execute(
      toolSchema.slug,
      {
        arguments: args,
        userId: userId ?? this.DEFAULT_ENTITY_ID,
        connectedAccountId: this.getComposio()?.getConnectedAccountId(appName),
      },
      modifiers
    );

    return JSON.stringify(results);
  }
}
