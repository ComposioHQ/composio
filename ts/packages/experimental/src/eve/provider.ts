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
import { type ToolContext, type ToolDefinition, defineTool } from 'eve/tools';
import type { ApprovalContext } from 'eve/tools/approval';
import { withDurableClosure } from './durable';
import { applyHooks, type EveProviderHooks } from './hooks';

export type EveTool = ToolDefinition<Record<string, unknown>, ToolExecuteResponse>;
export type EveToolCollection = Record<string, EveTool>;
export type EveNeedsApproval = (
  tool: Tool,
  context: ApprovalContext<Record<string, unknown>>
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

/** Live state a durable callback re-attaches to, keyed by the closure's slug. */
interface ToolBinding {
  readonly tool: Tool;
  readonly executeTool: ExecuteToolFn;
}

/** The JSON snapshot eve persists for each wrapped tool's callbacks. */
type ComposioToolClosure = { slug: string };

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

  /**
   * Live executors keyed by slug. A durable callback receives only its JSON
   * closure, so it looks the executor up here; bindings accumulate across
   * resolves so a call parked against an earlier tool set still finds one.
   */
  private readonly bindings = new Map<string, ToolBinding>();

  constructor(private readonly options: EveProviderOptions = {}) {
    super();
  }

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): EveTool {
    this.bindings.set(tool.slug, { tool, executeTool });
    const closure: ComposioToolClosure = { slug: tool.slug };

    return defineTool<Record<string, unknown>, ToolExecuteResponse>({
      description: tool.description ?? tool.name,
      inputSchema: toEveInputSchema(tool, this.options.strict),
      approval: this.options.needsApproval ? withDurableClosure(closure, this.approve) : undefined,
      execute: withDurableClosure(closure, this.execute),
    });
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): EveToolCollection {
    return Object.fromEntries(tools.map(tool => [tool.slug, this.wrapTool(tool, executeTool)]));
  }

  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({ url: new URL(item.url), name: item.name })) as McpServerGetResponse;
  }

  private readonly execute = async (
    closure: ComposioToolClosure,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecuteResponse> => {
    const { slug } = closure;
    return applyHooks(
      this.options.hooks ?? {},
      slug,
      normalizeToolArguments(input, slug),
      this.requireBinding(slug).executeTool,
      context
    );
  };

  private readonly approve = (
    closure: ComposioToolClosure,
    context: ApprovalContext<Record<string, unknown>>
  ): boolean =>
    this.options.needsApproval?.(this.requireBinding(closure.slug).tool, context) ?? false;

  private requireBinding(slug: string): ToolBinding {
    const binding = this.bindings.get(slug);
    if (!binding) {
      throw new Error(
        `Composio tool "${slug}" has no executor on this provider. Resolve the session's tools again before calling it.`
      );
    }
    return binding;
  }
}
