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
  McpUrlResponse,
  dereferenceJsonSchema,
  logger,
  removeNonRequiredProperties,
  telemetry,
  type UnresolvedRefReason,
} from '@composio/core';
import { applyCompatLayer } from '@mastra/schema-compat';
import { createTool } from '@mastra/core/tools';

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
  // Tracks the (toolSlug, ref) pairs we've already warned about, so wrapping
  // the same tool many times during a single SDK session does not flood the
  // logs. Reset is only via constructing a new provider.
  private warnedDanglingRefs = new Set<string>();

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
        : inputParams;

    // Inline internal $ref pointers before handing the schema to
    // @mastra/schema-compat. AJV (bundled inside schema-compat) refuses to
    // compile a schema with unresolved $ref, and the upstream JSON-Schema →
    // Zod converter silently degrades $ref-typed properties to a permissive
    // anyOf — losing the type info from $defs. See
    // https://github.com/mastra-ai/mastra/issues/15341.
    //
    // Some Composio-API-supplied tools emit a `$ref` into `#/$defs/...`
    // without ever declaring `$defs` (e.g. `GMAIL_FETCH_EMAILS`). Strict
    // dereferencing throws on this, which crashes `tools.get` upfront. Opt
    // into `'sentinel'` so the dangling branch becomes a permissive object
    // schema instead, and emit a single warn per (toolSlug, ref) pair so the
    // degraded shape is observable. See
    // https://github.com/ComposioHQ/composio/issues/3307.
    const onReplace = (ref: string, reason: UnresolvedRefReason) =>
      this.warnDanglingRefOnce(tool, ref, reason);

    const inputSchema = applyCompatLayer({
      schema: dereferenceJsonSchema(parameters ?? {}, {
        onUnresolved: 'sentinel',
        onReplace,
      }),
      compatLayers: [],
      mode: 'jsonSchema',
    });

    const outputSchema = applyCompatLayer({
      schema: dereferenceJsonSchema(tool.outputParameters ?? {}, {
        onUnresolved: 'sentinel',
        onReplace,
      }),
      compatLayers: [],
      mode: 'jsonSchema',
    });

    const mastraTool = createTool({
      id: tool.slug,
      description: tool.description ?? '',
      // @ts-ignore
      inputSchema,
      // @ts-ignore
      outputSchema,
      execute: async (inputData, _context) => {
        const result = await executeTool(tool.slug, inputData as Record<string, unknown>);
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

  private warnDanglingRefOnce(tool: Tool, ref: string, reason: UnresolvedRefReason): void {
    const key = `${tool.slug}::${ref}`;
    if (this.warnedDanglingRefs.has(key)) return;
    this.warnedDanglingRefs.add(key);
    const toolkitSlug = tool.toolkit?.slug ?? 'unknown';
    // `tool.slug`, `toolkitSlug`, and `ref` originate from the upstream API
    // schema. Quoting via `JSON.stringify` neutralizes embedded newlines /
    // ANSI escape sequences / control bytes that would otherwise forge log
    // lines or corrupt terminals (CWE-117).
    logger.warn(
      `[composio/mastra] Tool ${JSON.stringify(tool.slug)} ` +
        `(toolkit ${JSON.stringify(toolkitSlug)}) declares ` +
        `$ref ${JSON.stringify(ref)} but no matching $defs/definitions entry ` +
        `(${reason}). Falling back to a permissive object schema for this ` +
        `branch — the wrapped Mastra tool will validate this property loosely. ` +
        `Tracked in https://github.com/ComposioHQ/composio/issues/3307.`
    );
    // Fire-and-forget aggregate signal so the Composio team can prioritize the
    // upstream API fix from real data. `telemetry.sendMetric` short-circuits
    // when `COMPOSIO_DISABLE_TELEMETRY=true` and swallows network errors.
    void telemetry.sendMetric([
      {
        functionName: 'composio.mastra.wrapTool.danglingRef',
        timestamp: Date.now() / 1000,
        props: { toolSlug: tool.slug, toolkitSlug, ref, reason },
        metadata: { provider: 'mastra' },
      },
    ]);
  }
}
