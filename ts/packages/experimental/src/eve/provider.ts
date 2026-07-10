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

const MULTI_EXECUTE_TOOL_SLUG = 'COMPOSIO_MULTI_EXECUTE_TOOL';

const toEveInputSchema = (tool: Tool, strict?: boolean): Record<string, JsonValue> => {
  const params = tool.inputParameters;
  if (!params) return { type: 'object', properties: {} };
  if (!strict || params.type !== 'object') return params as Record<string, JsonValue>;

  return removeNonRequiredProperties({
    ...params,
    properties: { ...params.properties },
  }) as Record<string, JsonValue>;
};

const toEveApprovalPolicy = (
  tool: Tool,
  approvalPolicy?: EveNeedsApproval
): EveTool['needsApproval'] => {
  if (!approvalPolicy) return undefined;
  return context => approvalPolicy(tool, context);
};

const isProtectedToolItem = (item: unknown, protectedSlugs: ReadonlySet<string>): boolean => {
  if (typeof item !== 'object' || item === null) return false;

  const toolSlug = (item as Record<string, unknown>).tool_slug;
  if (typeof toolSlug !== 'string') return false;

  return protectedSlugs.has(toolSlug.toUpperCase());
};

/** Require approval for direct calls and matching entries inside a multi-execute call. */
export const requireApprovalForTools = (...toolSlugs: string[]): EveNeedsApproval => {
  const protectedSlugs = new Set(toolSlugs.map(slug => slug.toUpperCase()));
  return (tool, context) => {
    const normalizedToolSlug = tool.slug.toUpperCase();
    if (protectedSlugs.has(normalizedToolSlug)) return true;
    if (normalizedToolSlug !== MULTI_EXECUTE_TOOL_SLUG) return false;

    const requestedTools = context.toolInput?.tools;
    if (!Array.isArray(requestedTools)) return false;

    return requestedTools.some(item => isProtectedToolItem(item, protectedSlugs));
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
    const inputSchema = toEveInputSchema(tool, this.options.strict);
    const needsApproval = toEveApprovalPolicy(tool, this.options.needsApproval);

    return defineTool({
      description: tool.description ?? tool.name,
      inputSchema,
      needsApproval,
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
