/**
 * @fileoverview Factory functions for creating custom tools and toolkits.
 *
 * Usage:
 * ```typescript
 * import { experimental_createTool, experimental_createToolkit } from '@composio/core';
 *
 * const grep = createCustomTool('GREP', {
 *   name: 'Grep Search',
 *   description: 'Search for patterns in files',
 *   inputParams: z.object({ pattern: z.string() }),
 *   execute: async (input) => ({ matches: [] }),
 * });
 *
 * const devTools = createCustomToolkit('DEV_TOOLS', {
 *   name: 'Dev Tools',
 *   description: 'Local dev utilities',
 *   tools: [grep],
 * });
 * ```
 */
import * as zodToJsonSchema from 'zod-to-json-schema';
import { z } from 'zod/v3';
import {
  CreateCustomToolBaseSchema,
  CreateCustomToolkitBaseSchema,
  CustomToolSlugSchema,
  type CreateCustomToolParams,
  type CreateCustomToolkitParams,
  type CustomTool,
  type CustomToolkit,
  type CustomToolExecuteFn,
  type CustomToolsMap,
  type CustomToolsMapEntry,
  type CustomToolDefinition,
  type CustomToolkitDefinition,
  type InputParamsSchema,
} from '../types/customTool.types';
import type { SessionCreateResponse } from '@composio/client/resources/tool-router/session/session.mjs';
import { ValidationError } from '../errors';

/** Prefix applied by the backend to local tool slugs for disambiguation. */
export const LOCAL_TOOL_PREFIX = 'LOCAL_';

/** Maximum allowed length for the final prefixed slug. */
const MAX_SLUG_LENGTH = 60;

/**
 * Compute the final slug length for a tool given its context.
 * Returns the expected length of LOCAL_[TOOLKIT_]SLUG.
 */
function computeFinalSlugLength(toolSlug: string, toolkitSlug?: string): number {
  // LOCAL_ + optional TOOLKIT_ + SLUG
  return LOCAL_TOOL_PREFIX.length
    + (toolkitSlug ? toolkitSlug.length + 1 : 0) // +1 for underscore separator
    + toolSlug.length;
}

/**
 * Validate that the final slug won't exceed the max length.
 * Called early in createCustomTool/createCustomToolkit for fast feedback.
 */
function validateSlugLength(toolSlug: string, toolkitSlug: string | undefined, context: string): void {
  const finalLength = computeFinalSlugLength(toolSlug, toolkitSlug);
  if (finalLength > MAX_SLUG_LENGTH) {
    const prefix = LOCAL_TOOL_PREFIX + (toolkitSlug ? `${toolkitSlug.toUpperCase()}_` : '');
    const available = MAX_SLUG_LENGTH - prefix.length;
    throw new ValidationError(
      `${context}: slug "${toolSlug}" is too long. ` +
      `With prefix "${prefix}", the final slug would be ${finalLength} characters (max ${MAX_SLUG_LENGTH}). ` +
      `Shorten the slug to at most ${available} characters.`
    );
  }
}

/**
 * Create a custom tool for use in tool router sessions.
 *
 * The returned object is a lightweight reference containing the tool's metadata
 * and execute function. Pass it to `composio.create(userId, { experimental: { customTools: [...] } })`
 * to bind it to a session.
 *
 * Just return the result data from `execute`, or throw an error.
 * The SDK wraps it into the standard response format internally.
 *
 * **Slug naming:** The slug you provide is automatically prefixed with `LOCAL_` when
 * exposed to the agent (e.g. `'GREP'` becomes `LOCAL_GREP`). If the tool is inside a
 * custom toolkit, the toolkit slug is also included (e.g. `LOCAL_DEV_TOOLS_GREP`).
 * The `LOCAL_` prefix is reserved and cannot be used in your slug.
 *
 * @param slug - Unique tool identifier (alphanumeric, underscores, hyphens; no LOCAL_ or COMPOSIO_ prefix)
 * @param options - Tool definition including name, schema, and execute function
 * @returns A CustomTool to pass to session creation
 *
 * @example Standalone tool (no auth)
 * ```typescript
 * const grep = createCustomTool('GREP', {
 *   name: 'Grep Search',
 *   description: 'Search for patterns in files',
 *   inputParams: z.object({ pattern: z.string(), path: z.string() }),
 *   execute: async (input) => ({ matches: [] }),
 * });
 * ```
 *
 * @example Tool extending a Composio toolkit (inherits auth)
 * ```typescript
 * const getImportant = createCustomTool('GET_IMPORTANT_EMAILS', {
 *   name: 'Get Important Emails',
 *   description: 'Fetch high-priority emails',
 *   extendsToolkit: 'gmail',
 *   inputParams: z.object({ limit: z.number().default(10) }),
 *   execute: async (input, ctx) => {
 *     const result = await ctx.execute('GMAIL_SEARCH', { query: 'is:important' });
 *     return { emails: result.data };
 *   },
 * });
 * ```
 */
export function createCustomTool<T extends z.ZodType>(
  slug: string,
  options: CreateCustomToolParams<T>
): CustomTool {
  // Validate slug separately
  const slugResult = CustomToolSlugSchema.safeParse(slug);
  if (!slugResult.success) {
    throw new ValidationError(`createCustomTool: ${slugResult.error.issues[0].message}`, { cause: slugResult.error });
  }

  // Validate string/scalar fields via Zod schema
  const validated = CreateCustomToolBaseSchema.parse(options);

  // Manual checks for fields Zod can't validate
  if (!options.inputParams) {
    throw new ValidationError('createCustomTool: inputParams is required');
  }
  // Use _def.typeName instead of instanceof to work across different Zod instances
  if ((options.inputParams as { _def?: { typeName?: string } })?._def?.typeName !== 'ZodObject') {
    throw new ValidationError(
      'createCustomTool: inputParams must be a z.object() schema. ' +
      'Tool input parameters are always an object with named properties.'
    );
  }
  if (typeof options.execute !== 'function') {
    throw new ValidationError('createCustomTool: execute must be a function');
  }

  // Early length validation (standalone or extension — we know both parts)
  validateSlugLength(slug, validated.extendsToolkit, 'createCustomTool');

  const { inputParams, execute } = options;

  // Convert Zod input schema → JSON Schema (inputParams is guaranteed to be z.object)
  const paramsSchema = zodToJsonSchema.default(inputParams, {
    name: 'input',
  }) as InputParamsSchema;
  const paramsSchemaJson = paramsSchema.definitions.input;

  const inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: paramsSchemaJson.properties,
    ...(paramsSchemaJson.required ? { required: paramsSchemaJson.required } : {}),
  };

  // Convert Zod output schema → JSON Schema (if provided, any Zod type allowed)
  let outputSchema: Record<string, unknown> | undefined;
  if (options.outputParams) {
    const outSchema = zodToJsonSchema.default(options.outputParams, {
      name: 'output',
    }) as { definitions: { output: Record<string, unknown> } };
    outputSchema = outSchema.definitions.output;
  }

  return {
    slug: slugResult.data,
    name: validated.name,
    description: validated.description,
    extendsToolkit: validated.extendsToolkit,
    inputSchema,
    outputSchema,
    inputParams,
    execute: execute as CustomToolExecuteFn<z.ZodType>,
  };
}

/**
 * Create a custom toolkit that groups related tools.
 *
 * Tools passed here must NOT have `extendsToolkit` set — they inherit the toolkit identity instead.
 *
 * **Slug naming:** The toolkit slug becomes part of the final tool slug exposed to the agent.
 * For example, a toolkit `'DEV_TOOLS'` with a tool `'GREP'` produces `LOCAL_DEV_TOOLS_GREP`.
 * The `LOCAL_` prefix is reserved and cannot be used in your slug.
 *
 * @param slug - Unique toolkit identifier (alphanumeric, underscores, hyphens; no LOCAL_ or COMPOSIO_ prefix)
 * @param options - Toolkit definition including name, description, and tools
 * @returns A CustomToolkit to pass to session creation
 *
 * @example
 * ```typescript
 * const devTools = createCustomToolkit('DEV_TOOLS', {
 *   name: 'Dev Tools',
 *   description: 'Local dev utilities',
 *   tools: [grepTool, sedTool],
 * });
 * ```
 */
export function createCustomToolkit(
  slug: string,
  options: CreateCustomToolkitParams
): CustomToolkit {
  // Validate slug
  const slugResult = CustomToolSlugSchema.safeParse(slug);
  if (!slugResult.success) {
    throw new ValidationError(`createCustomToolkit: ${slugResult.error.issues[0].message}`, { cause: slugResult.error });
  }

  // Validate name/description
  const validated = CreateCustomToolkitBaseSchema.parse(options);

  // Non-empty tools required
  if (!options.tools?.length) {
    throw new ValidationError('createCustomToolkit: at least one tool is required');
  }

  // Validate each tool
  for (const tool of options.tools) {
    // Reject tools with extendsToolkit
    if (tool.extendsToolkit) {
      throw new ValidationError(
        `createCustomToolkit: tool "${tool.slug}" has extendsToolkit set. ` +
        `Tools in a custom toolkit must not use extendsToolkit — they inherit the toolkit identity instead.`
      );
    }
    // Early length validation — we know both toolkit slug and tool slug
    validateSlugLength(tool.slug, slug, `createCustomToolkit("${slug}")`);
  }

  return {
    slug: slugResult.data,
    name: validated.name,
    description: validated.description,
    tools: options.tools,
  };
}

/**
 * Build the final slug for a custom tool given its context.
 * @internal
 */
function buildFinalSlug(toolSlug: string, toolkitSlug?: string): string {
  const upper = toolSlug.toUpperCase();
  return toolkitSlug
    ? `${LOCAL_TOOL_PREFIX}${toolkitSlug.toUpperCase()}_${upper}`
    : `${LOCAL_TOOL_PREFIX}${upper}`;
}

/**
 * Build a CustomToolsMap from custom tools and toolkits.
 * Used internally by ToolRouter.create() to construct the per-session routing map.
 *
 * @internal
 * @param tools - Standalone custom tools
 * @param toolkits - Custom toolkits containing grouped tools
 * @returns Maps for O(1) lookup by both final and original slug
 * @throws If duplicate slugs or cross-group collisions
 */
export function buildCustomToolsMap(
  tools: CustomTool[],
  toolkits?: CustomToolkit[]
): CustomToolsMap {
  const byFinalSlug = new Map<string, CustomToolsMapEntry>();
  const byOriginalSlug = new Map<string, CustomToolsMapEntry>();

  const addEntry = (handle: CustomTool, finalSlug: string, toolkit?: string) => {
    const originalSlug = handle.slug.toUpperCase();

    // Length validated early in createCustomTool/createCustomToolkit, but check as safety net
    if (finalSlug.length > MAX_SLUG_LENGTH) {
      throw new ValidationError(
        `Custom tool slug "${handle.slug}" produces final slug "${finalSlug}" ` +
        `which exceeds ${MAX_SLUG_LENGTH} characters.`
      );
    }

    // Check cross-group collisions on final slug
    if (byFinalSlug.has(finalSlug)) {
      throw new ValidationError(`Custom tool slug collision: "${finalSlug}" is already registered.`);
    }

    // Check cross-group collisions on original slug
    if (byOriginalSlug.has(originalSlug)) {
      throw new ValidationError(
        `Custom tool slug collision: original slug "${handle.slug}" maps to multiple final slugs. ` +
        `"${byOriginalSlug.get(originalSlug)!.finalSlug}" and "${finalSlug}" both resolve from "${originalSlug}".`
      );
    }

    const entry: CustomToolsMapEntry = { handle, finalSlug, toolkit };
    byFinalSlug.set(finalSlug, entry);
    byOriginalSlug.set(originalSlug, entry);
  };

  // Process standalone tools
  for (const handle of tools) {
    addEntry(
      handle,
      buildFinalSlug(handle.slug, handle.extendsToolkit),
      handle.extendsToolkit
    );
  }

  // Process toolkit tools
  if (toolkits) {
    for (const toolkit of toolkits) {
      for (const handle of toolkit.tools) {
        addEntry(handle, buildFinalSlug(handle.slug, toolkit.slug), toolkit.slug);
      }
    }
  }

  return { byFinalSlug, byOriginalSlug, toolkits };
}

/**
 * Serialize custom tools into the format expected by the backend session creation API.
 *
 * Maps `extendsToolkit` → `extends_toolkit` for backend. Omitted for standalone tools.
 *
 * @internal
 * @param tools - The custom tools to serialize
 * @returns Array of CustomToolDefinition for the API payload
 */
export function serializeCustomTools(
  tools: CustomTool[]
): CustomToolDefinition[] {
  return tools.map(handle => ({
    slug: handle.slug,
    name: handle.name,
    description: handle.description,
    input_schema: handle.inputSchema,
    ...(handle.outputSchema ? { output_schema: handle.outputSchema } : {}),
    ...(handle.extendsToolkit ? { extends_toolkit: handle.extendsToolkit } : {}),
  }));
}

/**
 * Serialize custom toolkits into the format expected by the backend session creation API.
 *
 * @internal
 * @param toolkits - The custom toolkits to serialize
 * @returns Array of CustomToolkitDefinition for the API payload
 */
export function serializeCustomToolkits(
  toolkits: CustomToolkit[]
): CustomToolkitDefinition[] {
  return toolkits.map(tk => ({
    slug: tk.slug,
    name: tk.name,
    description: tk.description,
    tools: tk.tools.map(t => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      ...(t.outputSchema ? { output_schema: t.outputSchema } : {}),
    })),
  }));
}

/**
 * Build a CustomToolsMap using the slug/original_slug mapping from the session create response.
 * This uses the backend's authoritative prefixed slugs instead of computing them client-side.
 *
 * @internal
 * @param tools - The original custom tools passed to session creation
 * @param toolkits - The original custom toolkits passed to session creation
 * @param experimental - The experimental section from the session create response
 * @returns Maps for O(1) lookup by both final and original slug
 */
export function buildCustomToolsMapFromResponse(
  tools: CustomTool[],
  toolkits: CustomToolkit[] | undefined,
  experimental: SessionCreateResponse['experimental'] | undefined
): CustomToolsMap {
  const byFinalSlug = new Map<string, CustomToolsMapEntry>();
  const byOriginalSlug = new Map<string, CustomToolsMapEntry>();

  // Build a lookup from original slug → custom tool handle (for matching response items)
  const handlesByOriginalSlug = new Map<string, { handle: CustomTool; toolkit?: string }>();
  for (const handle of tools) {
    handlesByOriginalSlug.set(handle.slug.toUpperCase(), { handle, toolkit: handle.extendsToolkit });
  }
  if (toolkits) {
    for (const tk of toolkits) {
      for (const handle of tk.tools) {
        handlesByOriginalSlug.set(handle.slug.toUpperCase(), { handle, toolkit: tk.slug });
      }
    }
  }

  const addEntry = (finalSlug: string, originalSlug: string, toolkit?: string) => {
    const match = handlesByOriginalSlug.get(originalSlug.toUpperCase());
    if (!match) return; // Response tool not found in our handles (shouldn't happen)

    const entry: CustomToolsMapEntry = {
      handle: match.handle,
      finalSlug,
      toolkit: toolkit ?? match.toolkit,
    };
    byFinalSlug.set(finalSlug, entry);
    byOriginalSlug.set(originalSlug.toUpperCase(), entry);
  };

  // Map standalone custom tools from response
  if (experimental?.custom_tools) {
    for (const ct of experimental.custom_tools) {
      addEntry(ct.slug, ct.original_slug, ct.extends_toolkit);
    }
  }

  // Map toolkit custom tools from response
  if (experimental?.custom_toolkits) {
    for (const ctk of experimental.custom_toolkits) {
      for (const ct of ctk.tools) {
        addEntry(ct.slug, ct.original_slug, ctk.slug);
      }
    }
  }

  return { byFinalSlug, byOriginalSlug, toolkits };
}
