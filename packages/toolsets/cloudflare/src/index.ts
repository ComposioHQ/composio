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
import { Tool, ExecuteToolModifiers, BaseNonAgenticToolset } from '@composio/core';
import { ToolExecuteParams } from 'packages/core/src/types/tool.types';
import { ExecuteToolFnOptions } from 'packages/core/src/types/toolset.types';

type AiToolCollection = Record<string, AiTextGenerationToolInput>;

export class CloudflareToolset extends BaseNonAgenticToolset<
  AiToolCollection,
  AiTextGenerationToolInput
> {
  readonly name = 'cloudflare';

  wrapTool(tool: Tool): AiTextGenerationToolInput {
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

  wrapTools(tools: Tool[]): AiToolCollection {
    return tools.reduce(
      (acc, tool) => ({
        ...acc,
        [tool.slug]: this.wrapTool(tool),
      }),
      {}
    );
  }

  /**
   * Execute a tool call.
   * @param tool - The tool to execute.
   * @param userId - The user id.
   * @returns The results of the tool call.
   */
  async executeToolCall(
    userId: string,
    tool: { name: string; arguments: unknown },
    options: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments,
      connectedAccountId: options.connectedAccountId,
      customAuthParams: options.customAuthParams,
      userId: userId,
    };

    const result = await this.executeTool(tool.name, payload, modifiers);
    return JSON.stringify(result);
  }
}
