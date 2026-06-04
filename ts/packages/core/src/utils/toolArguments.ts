/**
 * Tool-argument normalization.
 *
 * Models (and MCP transports) occasionally emit tool-call arguments as a JSON
 * *string* instead of an object. `COMPOSIO_MULTI_EXECUTE_TOOL` and Vercel AI
 * SDK streaming are common triggers. Forwarding that raw string to execution
 * surfaces opaque downstream errors such as
 * `tool_use.input: Input should be a valid dictionary`.
 *
 * `normalizeToolArguments` is the single coercion every provider routes through
 * so the behaviour is identical everywhere instead of being re-implemented
 * (inconsistently) per provider.
 *
 * @see https://github.com/ComposioHQ/composio/issues/2406
 */
import { ComposioInvalidToolArgumentsError } from '../errors/ToolErrors';

/**
 * Coerce model-supplied tool arguments into a plain object.
 *
 * Rules:
 * - `null` / `undefined` → `{}` (some models send no arguments for no-arg tools).
 * - A plain object is returned unchanged.
 * - A string is JSON-parsed; an empty / whitespace-only string becomes `{}`.
 * - Anything that does not resolve to a plain object (arrays, primitives,
 *   unparseable strings, JSON that parses to a non-object) throws a typed
 *   {@link ComposioInvalidToolArgumentsError} so callers get an actionable
 *   message instead of a raw `SyntaxError` or a silent malformed payload.
 *
 * @param input - Raw arguments as received from the model / framework.
 * @param toolSlug - Optional tool slug, used to enrich the error message.
 * @returns The normalized arguments as a `Record<string, unknown>`.
 */
export function normalizeToolArguments(input: unknown, toolSlug?: string): Record<string, unknown> {
  if (input === null || input === undefined) {
    return {};
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') {
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (cause) {
      throw new ComposioInvalidToolArgumentsError(
        `${describeTool(toolSlug)} received arguments as a string that is not valid JSON`,
        { cause: cause instanceof Error ? cause : undefined }
      );
    }
    return assertPlainObject(parsed, toolSlug);
  }

  return assertPlainObject(input, toolSlug);
}

function assertPlainObject(value: unknown, toolSlug?: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  const actual = Array.isArray(value) ? 'array' : typeof value;
  throw new ComposioInvalidToolArgumentsError(
    `${describeTool(toolSlug)} expected arguments to be an object, received ${actual}`
  );
}

function describeTool(toolSlug?: string): string {
  return toolSlug ? `Tool '${toolSlug}'` : 'Tool';
}
