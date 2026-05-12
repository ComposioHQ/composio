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
  type CustomToolWireDefinition,
  type CustomToolkitWireDefinition,
  type InputParamsSchema,
} from '../types/customTool.types';
import type {
  SessionCreateResponse,
  SessionRetrieveResponse,
} from '@composio/client/resources/tool-router/session/session.mjs';
import { ValidationError } from '../errors';
import { PRELOAD_TOOLS_ALL } from '../lib/toolRouterConstants';

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
  return (
    LOCAL_TOOL_PREFIX.length +
    (toolkitSlug ? toolkitSlug.length + 1 : 0) + // +1 for underscore separator
    toolSlug.length
  );
}

/**
 * Validate that the final slug won't exceed the max length.
 * Called early in createCustomTool/createCustomToolkit for fast feedback.
 */
function validateSlugLength(
  toolSlug: string,
  toolkitSlug: string | undefined,
  context: string
): void {
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
 *     // Same response shape as session.execute(): { data, error, logId }
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
    throw new ValidationError(`createCustomTool: ${slugResult.error.issues[0].message}`, {
      cause: slugResult.error,
    });
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
    preload: validated.preload,
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
    throw new ValidationError(`createCustomToolkit: ${slugResult.error.issues[0].message}`, {
      cause: slugResult.error,
    });
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
    preload: validated.preload,
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

const qualifiedOriginalSlugKey = (toolkit: string | undefined, originalSlug: string): string =>
  `${toolkit?.toUpperCase() ?? ''}::${originalSlug.toUpperCase()}`;

const canShareOriginalSlug = (existing: CustomToolsMapEntry, next: CustomToolsMapEntry): boolean =>
  !!existing.toolkit &&
  !!next.toolkit &&
  existing.toolkit.toLowerCase() !== next.toolkit.toLowerCase();

const addOriginalSlugAlias = (params: {
  byOriginalSlug: Map<string, CustomToolsMapEntry>;
  ambiguousOriginalSlugs: Set<string>;
  originalSlug: string;
  entry: CustomToolsMapEntry;
}) => {
  const originalSlugKey = params.originalSlug.toUpperCase();
  if (params.ambiguousOriginalSlugs.has(originalSlugKey)) {
    return;
  }

  const existing = params.byOriginalSlug.get(originalSlugKey);
  if (!existing) {
    params.byOriginalSlug.set(originalSlugKey, params.entry);
    return;
  }

  if (existing.finalSlug.toUpperCase() === params.entry.finalSlug.toUpperCase()) {
    return;
  }

  if (canShareOriginalSlug(existing, params.entry)) {
    params.byOriginalSlug.delete(originalSlugKey);
    params.ambiguousOriginalSlugs.add(originalSlugKey);
    return;
  }

  throw new ValidationError(
    `Custom tool slug collision: original slug "${params.originalSlug}" maps to multiple final slugs. ` +
      `"${existing.finalSlug}" and "${params.entry.finalSlug}" both resolve from "${originalSlugKey}".`
  );
};

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
  const byToolkitAndOriginalSlug = new Map<string, CustomToolsMapEntry>();
  const ambiguousOriginalSlugs = new Set<string>();

  const addEntry = (handle: CustomTool, finalSlug: string, toolkit?: string) => {
    const originalSlug = handle.slug.toUpperCase();
    // Custom tool slugs are matched case-insensitively across local and response maps.
    const finalSlugKey = finalSlug.toUpperCase();

    // Length validated early in createCustomTool/createCustomToolkit, but check as safety net
    if (finalSlug.length > MAX_SLUG_LENGTH) {
      throw new ValidationError(
        `Custom tool slug "${handle.slug}" produces final slug "${finalSlug}" ` +
          `which exceeds ${MAX_SLUG_LENGTH} characters.`
      );
    }

    // Check cross-group collisions on final slug
    if (byFinalSlug.has(finalSlugKey)) {
      throw new ValidationError(
        `Custom tool slug collision: "${finalSlug}" is already registered.`
      );
    }

    const qualifiedKey = qualifiedOriginalSlugKey(toolkit, originalSlug);
    if (byToolkitAndOriginalSlug.has(qualifiedKey)) {
      throw new ValidationError(
        `Custom tool slug collision: original slug "${handle.slug}" is already registered for toolkit "${toolkit ?? 'custom'}".`
      );
    }

    const entry: CustomToolsMapEntry = { handle, finalSlug, toolkit };
    byFinalSlug.set(finalSlugKey, entry);
    byToolkitAndOriginalSlug.set(qualifiedKey, entry);
    addOriginalSlugAlias({ byOriginalSlug, ambiguousOriginalSlugs, originalSlug, entry });
  };

  // Process standalone tools
  for (const handle of tools) {
    addEntry(handle, buildFinalSlug(handle.slug, handle.extendsToolkit), handle.extendsToolkit);
  }

  // Process toolkit tools
  if (toolkits) {
    for (const toolkit of toolkits) {
      for (const handle of toolkit.tools) {
        addEntry(handle, buildFinalSlug(handle.slug, toolkit.slug), toolkit.slug);
      }
    }
  }

  return {
    byFinalSlug,
    byOriginalSlug,
    byToolkitAndOriginalSlug,
    ...(ambiguousOriginalSlugs.size ? { ambiguousOriginalSlugs } : {}),
    toolkits,
    tools: tools.length ? tools : undefined,
  };
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
type CustomToolSerializationOptions = {
  defaultPreload?: boolean;
};

function shouldSerializePreload(
  preload: boolean | undefined,
  inheritedPreload: boolean | undefined,
  defaultPreload: boolean
): boolean | undefined {
  const inheritedOrDefault = inheritedPreload ?? defaultPreload;
  if (preload !== undefined) {
    return preload || inheritedOrDefault ? preload : undefined;
  }
  if (inheritedPreload !== undefined) {
    return inheritedPreload || defaultPreload ? inheritedPreload : undefined;
  }
  return defaultPreload ? true : undefined;
}

function preloadWireProperty(
  preload: boolean | undefined,
  inheritedPreload: boolean | undefined,
  defaultPreload: boolean
): { preload?: boolean } {
  const serializedPreload = shouldSerializePreload(preload, inheritedPreload, defaultPreload);
  return serializedPreload === undefined ? {} : { preload: serializedPreload };
}

export function serializeCustomTools(
  tools: CustomTool[],
  options: CustomToolSerializationOptions = {}
): CustomToolWireDefinition[] {
  const defaultPreload = options.defaultPreload ?? false;
  return tools.map(handle => ({
    slug: handle.slug,
    name: handle.name,
    description: handle.description,
    input_schema: handle.inputSchema,
    ...(handle.outputSchema ? { output_schema: handle.outputSchema } : {}),
    ...(handle.extendsToolkit ? { extends_toolkit: handle.extendsToolkit } : {}),
    ...preloadWireProperty(handle.preload, undefined, defaultPreload),
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
  toolkits: CustomToolkit[],
  options: CustomToolSerializationOptions = {}
): CustomToolkitWireDefinition[] {
  const defaultPreload = options.defaultPreload ?? false;
  return toolkits.map(tk => ({
    slug: tk.slug,
    name: tk.name,
    description: tk.description,
    ...preloadWireProperty(tk.preload, undefined, defaultPreload),
    tools: tk.tools.map(t => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      ...(t.outputSchema ? { output_schema: t.outputSchema } : {}),
      ...preloadWireProperty(t.preload, tk.preload, defaultPreload),
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
  experimental:
    | SessionCreateResponse['experimental']
    | SessionRetrieveResponse['experimental']
    | undefined
): CustomToolsMap {
  const byFinalSlug = new Map<string, CustomToolsMapEntry>();
  const byOriginalSlug = new Map<string, CustomToolsMapEntry>();
  const byToolkitAndOriginalSlug = new Map<string, CustomToolsMapEntry>();
  const ambiguousOriginalSlugs = new Set<string>();

  type HandleMatch = { handle: CustomTool; toolkit?: string };
  const handlesByQualifiedOriginalSlug = new Map<string, HandleMatch>();
  const handlesByOriginalSlug = new Map<string, HandleMatch[]>();

  const registerHandle = (handle: CustomTool, toolkit?: string) => {
    const originalSlug = handle.slug.toUpperCase();
    const match = { handle, toolkit };
    handlesByQualifiedOriginalSlug.set(qualifiedOriginalSlugKey(toolkit, originalSlug), match);
    const existing = handlesByOriginalSlug.get(originalSlug) ?? [];
    existing.push(match);
    handlesByOriginalSlug.set(originalSlug, existing);
  };

  for (const handle of tools) {
    registerHandle(handle, handle.extendsToolkit);
  }
  if (toolkits) {
    for (const tk of toolkits) {
      for (const handle of tk.tools) {
        registerHandle(handle, tk.slug);
      }
    }
  }

  const findHandle = (originalSlug: string, toolkit?: string): HandleMatch | undefined => {
    const originalSlugKey = originalSlug.toUpperCase();
    const qualifiedMatch = handlesByQualifiedOriginalSlug.get(
      qualifiedOriginalSlugKey(toolkit, originalSlugKey)
    );
    if (qualifiedMatch) return qualifiedMatch;

    const bareMatches = handlesByOriginalSlug.get(originalSlugKey) ?? [];
    return bareMatches.length === 1 ? bareMatches[0] : undefined;
  };

  const addEntry = (finalSlug: string, originalSlug: string, toolkit?: string | null) => {
    const resolvedToolkit = toolkit ?? undefined;
    const match = findHandle(originalSlug, resolvedToolkit);
    if (!match) return; // Response tool not found in our handles (shouldn't happen)

    const finalSlugKey = finalSlug.toUpperCase();
    if (byFinalSlug.has(finalSlugKey)) {
      throw new ValidationError(
        `Custom tool slug collision: "${finalSlug}" is already registered.`
      );
    }

    const entry: CustomToolsMapEntry = {
      handle: match.handle,
      finalSlug,
      toolkit: resolvedToolkit ?? match.toolkit,
    };
    byFinalSlug.set(finalSlugKey, entry);
    byToolkitAndOriginalSlug.set(qualifiedOriginalSlugKey(entry.toolkit, originalSlug), entry);
    addOriginalSlugAlias({ byOriginalSlug, ambiguousOriginalSlugs, originalSlug, entry });
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

  return {
    byFinalSlug,
    byOriginalSlug,
    byToolkitAndOriginalSlug,
    ...(ambiguousOriginalSlugs.size ? { ambiguousOriginalSlugs } : {}),
    toolkits,
    tools: tools.length ? tools : undefined,
  };
}

/**
 * Find a custom tool entry by final slug only.
 *
 * @internal
 */
export function findCustomToolMapEntryByFinalSlug(
  customToolsMap: CustomToolsMap | undefined,
  slug: string
): CustomToolsMapEntry | undefined {
  return customToolsMap?.byFinalSlug.get(slug.toUpperCase());
}

/**
 * Find a custom toolkit tool entry by toolkit slug and original tool slug.
 *
 * @internal
 */
export function findCustomToolMapEntryByToolkitAndOriginalSlug(
  customToolsMap: CustomToolsMap | undefined,
  toolkit: string | undefined,
  slug: string
): CustomToolsMapEntry | undefined {
  return customToolsMap?.byToolkitAndOriginalSlug?.get(qualifiedOriginalSlugKey(toolkit, slug));
}

/**
 * Reject legacy attempts to preload custom tools through top-level preload.tools.
 *
 * Custom tool direct exposure is controlled by CustomTool.preload /
 * CustomToolkit.preload so it follows the current SDK-provided custom
 * definitions instead of stale session config.
 *
 * @internal
 */
export function assertNoCustomToolSlugsInPreload(
  preloadTools: readonly string[] | typeof PRELOAD_TOOLS_ALL | undefined,
  customToolsMap: CustomToolsMap | undefined
): void {
  if (!preloadTools || preloadTools === PRELOAD_TOOLS_ALL) {
    return;
  }

  const customPreloadSlugs = preloadTools.filter(slug => {
    const normalized = slug.toUpperCase();
    return (
      // Top-level preload.tools is only for Composio-managed tool slugs.
      // Custom tools use `preload: true` on their SDK definitions instead.
      normalized.startsWith(LOCAL_TOOL_PREFIX) ||
      customToolsMap?.byOriginalSlug.has(normalized) ||
      customToolsMap?.ambiguousOriginalSlugs?.has(normalized) ||
      customToolsMap?.byFinalSlug.has(normalized)
    );
  });

  if (customPreloadSlugs.length) {
    throw new ValidationError(
      `Custom tool slugs are not supported in preload.tools: ${customPreloadSlugs.join(
        ', '
      )}. Set preload: true on the SDK custom tool or custom toolkit definition instead.`
    );
  }
}

/**
 * Resolve custom tools that the SDK should expose directly from session.tools().
 *
 * @internal
 */
export function getPreloadedCustomToolSlugs(
  customToolsMap: CustomToolsMap | undefined,
  defaultPreload = false
): string[] {
  if (!customToolsMap) {
    return [];
  }

  const seen = new Set<string>();
  const customToolSlugs: string[] = [];

  for (const entry of customToolsMap.byFinalSlug.values()) {
    const toolkit = customToolsMap.toolkits?.find(
      tk => entry.toolkit && tk.slug.toLowerCase() === entry.toolkit.toLowerCase()
    );
    const shouldPreload = entry.handle.preload ?? toolkit?.preload ?? defaultPreload;
    if (!shouldPreload) {
      continue;
    }

    const finalSlugKey = entry.finalSlug.toUpperCase();
    if (seen.has(finalSlugKey)) {
      continue;
    }

    seen.add(finalSlugKey);
    customToolSlugs.push(entry.finalSlug);
  }

  return customToolSlugs;
}
