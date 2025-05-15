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
import { BaseAgenticToolset, Tool as ComposioTool } from '@composio/core';
import type { Tool as VercelTool } from 'ai';
import { jsonSchema, tool } from 'ai';
import { ExecuteToolFn } from 'packages/core/src/types/toolset.types';

type VercelToolCollection = Record<string, VercelTool>;
export class VercelToolset extends BaseAgenticToolset<VercelToolCollection, VercelTool> {
  readonly name = 'vercel';

  /**
   * Wrap a Composio tool in a Vercel tool.
   * @param {ComposioTool} composioTool - The Composio tool to wrap.
   * @returns {VercelTool} The wrapped Vercel tool.
   */
  wrapTool(composioTool: ComposioTool, executeTool: ExecuteToolFn): VercelTool {
    return tool({
      description: composioTool.description,
      parameters: jsonSchema(composioTool.inputParameters ?? {}),
      execute: async params => {
        const input = typeof params === 'string' ? JSON.parse(params) : params;
        return await executeTool(composioTool.slug, input);
      },
    });
  }

  /**
   * Wrap a list of Composio tools as a Vercel tool collection.
   * @param {ComposioTool[]} tools - The list of Composio tools to wrap.
   * @returns {VercelToolCollection} The wrapped Vercel tool collection.
   */
  wrapTools(tools: ComposioTool[], executeTool: ExecuteToolFn): VercelToolCollection {
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool, executeTool);
      return acc;
    }, {} as VercelToolCollection);
  }
}
