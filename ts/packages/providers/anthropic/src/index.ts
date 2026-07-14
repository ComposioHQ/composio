/**
 * Anthropic Provider
 *
 * This provider provides a set of tools for interacting with Anthropic's API.
 * It implements the non-agentic provider interface for Anthropic's Claude models.
 *
 * @packageDocumentation
 * @module providers/anthropic
 */
import {
  BaseNonAgenticProvider,
  Tool as ComposioTool,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  ToolExecuteParams,
  logger,
  McpUrlResponse,
  normalizeToolArguments,
  dereferenceJsonSchema,
  deduplicateJsonSchemaRequiredArrays,
} from '@composio/core';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicTool, InputSchema } from './types';
import {
  sanitizeSchemaPropertyKeys,
  restoreOriginalKeys,
  mappingHasRenames,
  KeyMapping,
} from './sanitize-keys';

export type AnthropicMcpServerGetResponse = {
  type: 'url';
  url: string;
  name: string;
}[];

/**
 * Collection of Anthropic tools
 */
export type AnthropicToolCollection = AnthropicTool[];

/**
 * Type for Anthropic tool use block in message content
 */
export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Type for Anthropic message content block
 */
export type AnthropicContentBlock = {
  type: string;
  [key: string]: unknown;
};

/**
 * Anthropic Provider implementation for Composio
 */
export class AnthropicProvider extends BaseNonAgenticProvider<
  AnthropicToolCollection,
  AnthropicTool,
  AnthropicMcpServerGetResponse
> {
  readonly name = 'anthropic';
  private cacheTools: boolean = false;

  /**
   * Per-tool reverse key mappings (`sanitized -> original`, shaped like the
   * schema), keyed by tool slug. Populated by {@link wrapTool} whenever a tool's
   * schema contains keys that violate Anthropic's `^[a-zA-Z0-9_.-]{1,64}$`
   * constraint, and read by {@link executeToolCall} to restore the original
   * parameter names before the call reaches the Composio backend.
   *
   * **Contract:** a tool must be wrapped and executed through the *same* provider
   * instance. This holds for the standard Composio flow — the model can only call
   * tools previously emitted by {@link wrapTools}/{@link wrapTool} on this
   * instance, and that wrapping registers the mapping. If a tool is somehow
   * executed on an instance that never wrapped it, no mapping is found and the
   * model's (already sanitized) argument keys are forwarded unchanged, so the
   * backend would see e.g. `dollar_top` instead of `$top`. {@link executeToolCall}
   * emits a `debug` log on the path that actually restores keys so this is
   * diagnosable.
   *
   * Re-wrapping a slug refreshes its entry (or clears it when the new schema
   * needs no rewriting), so the map stays consistent and its size is bounded by
   * the number of distinct sanitized tool slugs this instance has wrapped.
   */
  private toolKeyMappings: Map<string, KeyMapping> = new Map();

  /**
   * Creates a new instance of the AnthropicProvider.
   *
   * @param {Object} [options] - Configuration options for the provider
   * @param {boolean} [options.cacheTools=false] - Whether to cache tools using Anthropic's ephemeral cache
   *
   * @example
   * ```typescript
   * // Initialize with default settings (no caching)
   * const provider = new AnthropicProvider();
   *
   * // Initialize with tool caching enabled
   * const providerWithCaching = new AnthropicProvider({
   *   cacheTools: true
   * });
   *
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new AnthropicProvider({
   *     cacheTools: true
   *   })
   * });
   * ```
   */
  constructor(options?: { cacheTools?: boolean }) {
    super();
    this.cacheTools = options?.cacheTools ?? false;
    logger.debug(`AnthropicProvider initialized [cacheTools: ${this.cacheTools}]`);
  }

  /**
   * Wraps a Composio tool in the Anthropic format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by Anthropic's Claude API for tool use.
   *
   * @param tool - The Composio tool to wrap
   * @returns The wrapped tool in Anthropic format
   *
   * @example
   * ```typescript
   * // Wrap a single tool for use with Anthropic
   * const composioTool = {
   *   slug: 'SEARCH_TOOL',
   *   description: 'Search for information',
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       query: { type: 'string' }
   *     },
   *     required: ['query']
   *   }
   * };
   *
   * const anthropicTool = provider.wrapTool(composioTool);
   * ```
   */
  override wrapTool(tool: ComposioTool): AnthropicTool {
    const rawSchema = (tool.inputParameters || {
      type: 'object',
      properties: {},
      required: [],
    }) as InputSchema;

    // Inline internal `$ref` / `$defs` first so keys reachable only through a
    // reference become ordinary value positions that can be both sanitized and
    // restored. Lenient mode keeps an upstream schema with a dangling ref usable
    // (it degrades the branch to a permissive object) instead of throwing.
    const dereferenced = dereferenceJsonSchema(rawSchema, {
      onUnresolved: 'sentinel',
      onReplace: ref =>
        logger.debug(
          `AnthropicProvider: unresolved $ref "${ref}" in tool "${tool.slug}" replaced ` +
            `with a permissive schema`
        ),
    });

    // Anthropic rejects the whole `tools` array if any property key falls outside
    // `^[a-zA-Z0-9_.-]{1,64}$` (e.g. OData params like `$top`, `@odata.type`, or
    // over-long flattened keys). Rewrite offending keys and remember how to undo it.
    const { schema: sanitizedSchema, mapping } = sanitizeSchemaPropertyKeys(dereferenced);
    const schema = deduplicateJsonSchemaRequiredArrays(sanitizedSchema) as InputSchema;

    if (mappingHasRenames(mapping)) {
      this.toolKeyMappings.set(tool.slug, mapping);
      logger.debug(
        `AnthropicProvider rewrote non-conforming schema keys for tool "${tool.slug}"; ` +
          `original parameter names will be restored at execution time`
      );
    } else {
      // Clear any stale mapping from a previous wrap of the same slug whose
      // schema no longer needs rewriting, so restoration stays consistent.
      this.toolKeyMappings.delete(tool.slug);
    }

    return {
      name: tool.slug,
      description: tool.description || '',
      input_schema: schema,
      cache_control: this.cacheTools ? { type: 'ephemeral' } : undefined,
    };
  }

  /**
   * Wraps a list of Composio tools in the Anthropic format.
   *
   * This method transforms multiple Composio tool definitions into the format
   * expected by Anthropic's Claude API for tool use.
   *
   * @param tools - Array of Composio tools to wrap
   * @returns Array of wrapped tools in Anthropic format
   *
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Anthropic
   * const composioTools = [
   *   {
   *     slug: 'SEARCH_TOOL',
   *     description: 'Search for information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         query: { type: 'string' }
   *       }
   *     }
   *   },
   *   {
   *     slug: 'WEATHER_TOOL',
   *     description: 'Get weather information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         location: { type: 'string' }
   *       }
   *     }
   *   }
   * ];
   *
   * const anthropicTools = provider.wrapTools(composioTools);
   * ```
   */
  override wrapTools(tools: ComposioTool[]): AnthropicToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  /**
   * Executes a tool call from Anthropic's Claude API.
   *
   * This method processes a tool call from Anthropic's Claude API,
   * executes the corresponding Composio tool, and returns the result.
   *
   * @param userId - The user ID for authentication and tracking
   * @param toolUse - The tool use object from Anthropic
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns The result of the tool execution as a JSON string
   *
   * @example
   * ```typescript
   * // Execute a tool call from Anthropic
   * const toolUse = {
   *   type: 'tool_use',
   *   id: 'tu_abc123',
   *   name: 'SEARCH_TOOL',
   *   input: {
   *     query: 'composio documentation'
   *   }
   * };
   *
   * const result = await provider.executeToolCall(
   *   'user123',
   *   toolUse,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   * console.log(JSON.parse(result));
   * ```
   */
  async executeToolCall(
    userId: string,
    toolUse: AnthropicToolUseBlock,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    // Models occasionally emit tool input as a JSON string rather than an object
    // (issue #2406). Normalize to a plain object first so key restoration below can
    // walk it; restoring before normalizing would no-op on a raw string.
    const normalizedInput = normalizeToolArguments(toolUse.input, toolUse.name);

    // Undo any key sanitization applied in `wrapTool` so the backend receives the
    // tool's original parameter names (e.g. `dollar_top` -> `$top`). The mapping
    // is only present when this same instance wrapped the tool and rewrote keys
    // (see `toolKeyMappings`); otherwise the arguments pass through untouched.
    const mapping = this.toolKeyMappings.get(toolUse.name);
    let toolArguments = normalizedInput;
    if (mapping) {
      toolArguments = restoreOriginalKeys(normalizedInput, mapping) as Record<string, unknown>;
      logger.debug(`AnthropicProvider restored original argument keys for tool "${toolUse.name}"`);
    }

    const payload: ToolExecuteParams = {
      arguments: toolArguments,
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      customConnectionData: options?.customConnectionData,
      userId: userId,
    };
    const result = await this.executeTool(toolUse.name, payload, modifiers);
    return JSON.stringify(result.data);
  }

  /**
   * Handles tool calls from Anthropic's message response.
   *
   * This method processes tool calls from an Anthropic message response,
   * extracts the tool use blocks, executes each tool call, and returns the results.
   *
   * @param userId - The user ID for authentication and tracking
   * @param message - The message response from Anthropic
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns Array of tool execution results as JSON strings
   *
   * @example
   * ```typescript
   * // Handle tool calls from an Anthropic message response
   * const anthropic = new Anthropic({ apiKey: 'your-anthropic-api-key' });
   *
   * const message = await anthropic.messages.create({
   *   model: 'claude-3-opus-20240229',
   *   max_tokens: 1024,
   *   tools: provider.wrapTools(composioTools),
   *   messages: [
   *     {
   *       role: 'user',
   *       content: 'Search for information about Composio'
   *     }
   *   ]
   * });
   *
   * // Process any tool calls in the response
   * const results = await provider.handleToolCalls(
   *   'user123',
   *   message,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Use the results to continue the conversation
   * console.log(results);
   * ```
   */
  async handleToolCalls(
    userId: string,
    message: Anthropic.Message,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<Anthropic.Messages.MessageParam[]> {
    const outputs: Anthropic.Messages.ToolResultBlockParam[] = [];

    // Filter and map tool use blocks from message content
    const toolUseBlocks: AnthropicToolUseBlock[] = [];

    for (const content of message.content) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'type' in content &&
        typeof content.type === 'string' &&
        content.type.toString() === 'tool_use' &&
        'id' in content &&
        'name' in content &&
        'input' in content
      ) {
        toolUseBlocks.push({
          type: 'tool_use',
          id: String(content.id),
          name: String(content.name),
          input: content.input as Record<string, unknown>,
        });
      }
    }

    for (const toolUse of toolUseBlocks) {
      const toolResult = await this.executeToolCall(userId, toolUse, options, modifiers);
      outputs.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: toolResult,
        cache_control: this.cacheTools ? { type: 'ephemeral' } : undefined,
      });
    }

    return outputs.length > 0 ? [{ role: 'user', content: outputs }] : [];
  }

  /**
   * Transform MCP URL response into Anthropic-specific format.
   * By default, Anthropic uses the standard format (same as default),
   * but this method is here to show providers can customize if needed.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): AnthropicMcpServerGetResponse {
    // Anthropic uses the standard format with URL objects
    return data.map(item => ({
      url: item.url,
      name: item.name,
      type: 'url',
    }));
  }
}
