/**
 * Mastra Provider
 *
 * This provider provides a set of tools for interacting with Mastra.ai
 *
 * @packageDocumentation
 * @module providers/mastra
 */
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  jsonSchemaToZodSchema,
  McpUrlResponse,
  removeNonRequiredProperties,
} from '@composio/core';
import { createTool } from '@mastra/core';

export type MastraTool = ReturnType<typeof createTool>;

export interface MastraToolCollection {
  [key: string]: MastraTool;
}

export interface MastraUrlMap {
  [name: string]: { url: string };
}

export class MastraProvider extends BaseAgenticProvider<
  MastraToolCollection,
  MastraTool,
  MastraUrlMap
> {
  readonly name = 'mastra';
  private strict: boolean | null;

  /**
   * Creates a new instance of the MastraProvider.
   *
   * This provider enables integration with the Mastra AI SDK,
   * allowing Composio tools to be used with Mastra AI applications.
   *
   * @param param0
   * @param param0.strict - Whether to use strict mode for tool execution
   * @returns A new instance of the MastraProvider
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
   * import { MastraProvider } from '@composio/mastra';
   *
   * const composio = new Composio({
   *   apiKey: 'your-composio-api-key',
   *   provider: new MastraProvider(),
   * });
   * ```
   */
  constructor({ strict = false }: { strict?: boolean } = {}) {
    super();
    this.strict = strict;
  }

  /**
   * Transform MCP URL response into Anthropic-specific format.
   * By default, Anthropic uses the standard format (same as default),
   * but this method is here to show providers can customize if needed.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): MastraUrlMap {
    // Transform to Mastra's URL map format
    return data.reduce((acc: MastraUrlMap, item) => {
      acc[item.name] = { url: item.url };
      return acc;
    }, {});
  }

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): MastraTool {
    const inputParams = tool.inputParameters;

    const parameters =
      this.strict && inputParams?.type === 'object'
        ? removeNonRequiredProperties(
            inputParams as {
              type: 'object';
              properties: Record<string, unknown>;
              required?: string[];
            }
          )
        : (inputParams ?? {});

    const mastraTool = createTool({
      id: tool.slug,
      description: tool.description ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: parameters ? (jsonSchemaToZodSchema(parameters) as any) : undefined,
      outputSchema: tool.outputParameters
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (jsonSchemaToZodSchema(tool.outputParameters) as any)
        : undefined,
      execute: async (context: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await executeTool(tool.slug, context as any);
        return result;
      },
    });

    return mastraTool;
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): MastraToolCollection {
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool, executeTool);
      return acc;
    }, {} as MastraToolCollection);
  }
}
