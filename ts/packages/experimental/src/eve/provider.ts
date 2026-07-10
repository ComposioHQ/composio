import {
  BaseAgenticProvider,
  type ExecuteToolFn,
  type McpServerGetResponse,
  type McpUrlResponse,
  normalizeToolArguments,
  removeNonRequiredProperties,
  type Tool,
  type ToolExecuteResponse,
} from '@composio/core';
import type { JsonValue } from 'eve/connections';
import {
  type NeedsApprovalContext,
  type ToolContext,
  type ToolDefinition,
  defineTool,
} from 'eve/tools';
import { applyHooks, type EveProviderHooks } from './hooks';

export type EveTool = ToolDefinition<Record<string, unknown>, ToolExecuteResponse>;
export type EveToolCollection = Record<string, EveTool>;
export type EveNeedsApproval = (
  tool: Tool,
  context: NeedsApprovalContext<Record<string, unknown>>
) => boolean;

/** Require approval for direct calls and matching entries inside a multi-execute call. */
export const requireApprovalForTools = (...toolSlugs: string[]): EveNeedsApproval => {
  const protectedSlugs = new Set(toolSlugs.map(slug => slug.toUpperCase()));
  return (tool, context) => {
    if (protectedSlugs.has(tool.slug.toUpperCase())) return true;
    if (tool.slug !== 'COMPOSIO_MULTI_EXECUTE_TOOL') return false;

    const tools = context.toolInput?.tools;
    return (
      Array.isArray(tools) &&
      tools.some(
        item =>
          typeof item === 'object' &&
          item !== null &&
          protectedSlugs.has(String((item as Record<string, unknown>).tool_slug).toUpperCase())
      )
    );
  };
};

export interface EveProviderOptions {
  strict?: boolean;
  hooks?: EveProviderHooks;
  needsApproval?: EveNeedsApproval;
}

export class EveProvider extends BaseAgenticProvider<
  EveToolCollection,
  EveTool,
  McpServerGetResponse
> {
  readonly name = 'eve';

  constructor(private readonly options: EveProviderOptions = {}) {
    super();
  }

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): EveTool {
    const params = tool.inputParameters;
    const inputSchema =
      this.options.strict && params?.type === 'object'
        ? removeNonRequiredProperties({
            ...params,
            properties: { ...params.properties },
          })
        : (params ?? { type: 'object', properties: {} });

    return defineTool({
      description: tool.description ?? tool.name,
      inputSchema: inputSchema as Record<string, JsonValue>,
      needsApproval: this.options.needsApproval
        ? context => this.options.needsApproval?.(tool, context) ?? false
        : undefined,
      execute: (input, context: ToolContext) =>
        applyHooks(
          this.options.hooks ?? {},
          tool.slug,
          normalizeToolArguments(input, tool.slug),
          executeTool,
          context
        ),
    });
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): EveToolCollection {
    return Object.fromEntries(tools.map(tool => [tool.slug, this.wrapTool(tool, executeTool)]));
  }

  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({ url: new URL(item.url), name: item.name })) as McpServerGetResponse;
  }
}
