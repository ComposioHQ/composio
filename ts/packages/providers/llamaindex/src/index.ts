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
  normalizeToolArguments,
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
        // Models occasionally emit tool input as a JSON string rather than an object (issue #2406).
        const result = await executeTool(tool.slug, normalizeToolArguments(input, tool.slug));
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
   * Transform an MCP URL response into the LlamaIndex provider's format.
   * LlamaIndex uses the standard MCP server response shape, mapping each
   * entry to an object with a `URL` instance and its name.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    // LlamaIndex uses the standard format
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}
