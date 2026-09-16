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

export interface EveProviderOptions {
  strict?: boolean;
  hooks?: EveProviderHooks;
  needsApproval?: EveNeedsApproval;
}

/** Live state one `wrapTools` call produced, which its durable callbacks re-attach to. */
interface ToolBinding {
  readonly tools: ReadonlyMap<string, Tool>;
  readonly executeTool: ExecuteToolFn;
  readonly options: EveProviderOptions;
}

/** The JSON snapshot eve persists for each wrapped tool's callbacks. */
type ComposioToolClosure = { slug: string; binding: string };

/**
 * Bindings for every resolve in this process, keyed by the id stamped into the
 * closure. `executeTool` is bound to one Composio session, so a closure must
 * name the resolve that produced it rather than just the slug: sessions for
 * different users share one provider and would otherwise cross-execute. The
 * map is module-level because eve's callback registry is keyed by tool name
 * only, so a second `EveProvider` in the process replays through the same
 * callbacks. Entries live as long as the process; eve can resume a parked
 * call at any time. Ids carry a per-process token so a closure persisted by
 * an earlier process fails the lookup instead of matching whichever resolve
 * reused its counter value.
 */
const bindings = new Map<string, ToolBinding>();
const processToken = globalThis.crypto.randomUUID();
let nextBindingId = 0;

const bind = (binding: ToolBinding): string => {
  const id = `${processToken}:${++nextBindingId}`;
  bindings.set(id, binding);
  return id;
};

const requireBinding = ({ slug, binding }: ComposioToolClosure): ToolBinding & { tool: Tool } => {
  const bound = bindings.get(binding);
  const tool = bound?.tools.get(slug);
  if (!bound || !tool) {
    throw new Error(
      `Composio tool "${slug}" has no executor in this process. Resolve the session's tools again before calling it.`
    );
  }
  return { ...bound, tool };
};

const execute = async (
  closure: ComposioToolClosure,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolExecuteResponse> => {
  const { executeTool, options } = requireBinding(closure);
  return applyHooks(
    options.hooks ?? {},
    closure.slug,
    normalizeToolArguments(input, closure.slug),
    executeTool,
    context
  );
};

// Only stamped on tools whose binding carries a policy, so the policy is set here.
const approve = (
  closure: ComposioToolClosure,
  context: ApprovalContext<Record<string, unknown>>
): boolean => {
  const { tool, options } = requireBinding(closure);
  return options.needsApproval!(tool, context);
};

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
    return this.wrapTools([tool], executeTool)[tool.slug];
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): EveToolCollection {
    const binding = bind({
      tools: new Map(tools.map(tool => [tool.slug, tool])),
      executeTool,
      options: this.options,
    });
    return Object.fromEntries(tools.map(tool => [tool.slug, this.defineBoundTool(tool, binding)]));
  }

  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({ url: new URL(item.url), name: item.name })) as McpServerGetResponse;
  }

  private defineBoundTool(tool: Tool, binding: string): EveTool {
    const closure: ComposioToolClosure = { slug: tool.slug, binding };
    return defineTool<Record<string, unknown>, ToolExecuteResponse>({
      description: tool.description ?? tool.name,
      inputSchema: toEveInputSchema(tool, this.options.strict),
      approval: this.options.needsApproval ? withDurableClosure(closure, approve) : undefined,
      execute: withDurableClosure(closure, execute),
    });
  }
}
