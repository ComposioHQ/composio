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
  deduplicateJsonSchemaRequiredArrays,
  dereferenceJsonSchema,
  jsonSchemaToZodSchema,
  normalizeToolArguments,
} from '@composio/core';
import { FunctionTool, type tool as createLlamaindexTool } from 'llamaindex';

export type LlamaindexTool = ReturnType<typeof createLlamaindexTool>;
type LlamaindexToolParameters = ConstructorParameters<
  typeof FunctionTool<Record<string, unknown>, Promise<string>>
>[1]['parameters'];
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
    // The model sees the tool's JSON Schema as is, so keywords a Zod schema
    // cannot carry (`format`, `contentEncoding`, `contentMediaType`, `default`,
    // ...) reach it; LlamaIndex validates the arguments with the Zod schema
    // built from the same JSON Schema. The Zod converter does not follow $ref,
    // so inline the definitions first, then canonicalize the required arrays
    // the inlined definitions brought along.
    const parameters = deduplicateJsonSchemaRequiredArrays(
      dereferenceJsonSchema(tool.inputParameters ?? {}, { onUnresolved: 'sentinel' })
    );
    const execute = async (input: Record<string, unknown>) => {
      // Models occasionally emit tool input as a JSON string rather than an object (issue #2406).
      const result = await executeTool(tool.slug, normalizeToolArguments(input, tool.slug));
      return JSON.stringify(result);
    };
    return new FunctionTool(
      execute,
      {
        name: tool.slug,
        description: tool.description ?? tool.name ?? '',
        parameters: parameters as LlamaindexToolParameters,
      },
      jsonSchemaToZodSchema(parameters)
    ) as unknown as LlamaindexTool;
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
