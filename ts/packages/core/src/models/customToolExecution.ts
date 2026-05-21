/**
 * @fileoverview Standalone functions for custom tool lookup and execution.
 * Extracted from ToolRouterSession for reuse in SessionContextImpl (sibling routing).
 */
import type {
  CustomToolsMap,
  CustomToolsMapEntry,
  SessionContext,
} from '../types/customTool.types';
import type { ToolExecuteResponse } from '../types/tool.types';
import { ValidationError } from '../errors';
import { ComposioRequestCancelledError, isRequestAbortError } from '../errors/SDKErrors';

/**
 * Find a custom tool entry by slug.
 * Checks both the final slug map (LOCAL_X — agent/LLM path) and original slug map (X — programmatic path).
 */
export function findCustomTool(
  map: CustomToolsMap | undefined,
  slug: string
): CustomToolsMapEntry | undefined {
  if (!map) return undefined;
  const upper = slug.toUpperCase();
  const finalSlugMatch = map.byFinalSlug.get(upper);
  if (finalSlugMatch) return finalSlugMatch;
  if (map.ambiguousOriginalSlugs?.has(upper)) return undefined;
  return map.byOriginalSlug.get(upper);
}

/**
 * Reject ambiguous bare original slugs before falling through to backend execution.
 * Agents receive final slugs (LOCAL_<TOOLKIT>_<TOOL>) from schemas, while bare original
 * slugs are only a convenience for manual session.execute() calls when unique.
 */
export function assertUnambiguousCustomToolSlug(
  map: CustomToolsMap | undefined,
  slug: string
): void {
  if (!map) return;
  const upper = slug.toUpperCase();
  if (!map.ambiguousOriginalSlugs?.has(upper)) return;

  const finalSlugs = [...map.byFinalSlug.values()]
    .filter(entry => entry.handle.slug.toUpperCase() === upper)
    .map(entry => entry.finalSlug)
    .sort();
  const hint = finalSlugs.length ? ` Use one of: ${finalSlugs.join(', ')}.` : '';

  throw new ValidationError(
    `Ambiguous custom tool slug "${slug}". Multiple custom toolkit tools share this original slug; ` +
      `manual session.execute() by original slug is only supported when the original slug is unique.` +
      hint
  );
}

/**
 * Execute a custom tool in-process.
 * Validates input via the Zod schema, calls the user's execute function,
 * and wraps the result into the standard response format.
 *
 * Callers provide a pre-built SessionContext (which may include sibling routing).
 */
export async function executeCustomTool(
  entry: CustomToolsMapEntry,
  arguments_: Record<string, unknown>,
  sessionContext: SessionContext,
  options?: { signal?: AbortSignal }
): Promise<ToolExecuteResponse> {
  const { handle } = entry;

  if (options?.signal?.aborted) {
    throw new ComposioRequestCancelledError();
  }

  // Validate and transform input using the original Zod schema.
  // This applies defaults, coercions, and transforms (e.g. z.string().default('all')).
  const parsed = handle.inputParams.safeParse(arguments_);
  if (!parsed.success) {
    return {
      data: {},
      error: `Input validation failed: ${parsed.error.message}`,
      successful: false,
    };
  }
  if (options?.signal?.aborted) {
    throw new ComposioRequestCancelledError();
  }

  try {
    // Object.create preserves prototype methods (execute, proxyExecute) that spread would drop
    const ctxWithSignal: SessionContext = options?.signal
      ? Object.assign(Object.create(sessionContext as object) as SessionContext, {
          signal: options.signal,
        })
      : sessionContext;
    const data = await handle.execute(parsed.data, ctxWithSignal);
    return {
      data: data ?? {},
      error: null,
      successful: true,
    };
  } catch (err: unknown) {
    if (err instanceof ComposioRequestCancelledError) {
      throw err;
    }
    if (options?.signal?.aborted && isRequestAbortError(err)) {
      throw new ComposioRequestCancelledError(undefined, {
        cause: err instanceof Error ? err : undefined,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: {},
      error: message,
      successful: false,
    };
  }
}
