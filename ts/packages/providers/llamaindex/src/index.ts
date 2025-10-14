/**
 * Llamaindex Provider
 *
 * This provider provides a set of tools for interacting with Llamaindex.
 *
 * @packageDocumentation
 * @module providers/llamaindex
 */
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  McpServerGetResponse,
  McpUrlResponse,
  jsonSchemaToZodSchema,
} from '@composio/core';
import { tool as createLlamaindexTool, JSONValue } from 'llamaindex';

export type LlamaindexTool = ReturnType<typeof createLlamaindexTool>;
export type LlamaindexToolCollection = Array<LlamaindexTool>;

export class LlamaindexProvider extends BaseAgenticProvider<
  Array<LlamaindexTool>,
  LlamaindexTool,
  McpServerGetResponse
> {
  readonly name = 'llamaindex';

  /**
   * Wrap a tool in the llamaindex format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  wrapTool(tool: Tool, executeTool: ExecuteToolFn): LlamaindexTool {
    const inputParams = tool.inputParameters;
    const inputParametersSchema = jsonSchemaToZodSchema(inputParams ?? {});
    return createLlamaindexTool({
      name: tool.slug,
      description: tool.description ?? tool.name ?? '',
      parameters: inputParametersSchema,
      execute: async input => {
        const result = await executeTool(tool.slug, input as Record<string, unknown>);
        return JSON.stringify(result);
      },
    });
  }

  /**
   * Wrap a list of tools in the llamaindex format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools.
   */
  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): LlamaindexToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }

  /**
   * Transform MCP URL response into Anthropic-specific format.
   * By default, Anthropic uses the standard format (same as default),
   * but this method is here to show providers can customize if needed.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    // Anthropic uses the standard format
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}
