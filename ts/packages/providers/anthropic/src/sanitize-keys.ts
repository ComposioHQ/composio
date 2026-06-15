/**
 * Anthropic tool-schema key sanitization.
 *
 * Anthropic's Messages API validates every tool `input_schema` property key
 * against the pattern `^[a-zA-Z0-9_.-]{1,64}$`. A single non-conforming key
 * makes the API reject the entire `tools` array with HTTP 400, so one bad tool
 * takes down every other tool in the same request.
 *
 * Composio tools can surface keys that break this pattern in two ways:
 *  - **Illegal characters** — e.g. the OneDrive toolkit exposes Microsoft Graph
 *    OData parameters such as `$top`, `$filter` or `@microsoft.graph.conflictBehavior`
 *    whose `$` and `@` are outside the allowed set.
 *  - **Length** — flattening nested objects with `__` separators can produce keys
 *    longer than 64 characters (e.g. several Zoom tools).
 *
 * This module rewrites offending keys to conforming aliases before the schema is
 * sent to Anthropic, and records a reverse mapping so the original parameter names
 * can be restored before a tool call is executed against the Composio backend.
 *
 * @packageDocumentation
 * @module providers/anthropic/sanitize-keys
 */

/** Anthropic's allowed property-key pattern. */
const VALID_KEY_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

/** Maximum length Anthropic accepts for a property key. */
const MAX_KEY_LENGTH = 64;

/**
 * Readable replacements for the most common illegal characters so aliases stay
 * recognizable (e.g. `$top` -> `dollar_top`, `@odata.type` -> `at_odata.type`).
 * Any other illegal character falls back to `_`. Mirrors the Python SDK's
 * sanitization for cross-language consistency.
 */
const ILLEGAL_CHAR_MAP: Record<string, string> = {
  $: 'dollar_',
  '@': 'at_',
};

/** Mapping of sanitized key -> original key, used to restore names at execution. */
export type KeyMapping = Record<string, string>;

/**
 * Deterministic, dependency-free hash (djb2) rendered as a short base-36 string.
 * Used as a uniqueness suffix when truncating long keys or resolving collisions.
 */
function shortHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // Force unsigned and keep it short but collision-resistant enough for keys.
  return (hash >>> 0).toString(36).slice(0, 7);
}

/** Whether a key is already valid for Anthropic and needs no rewriting. */
function isValidKey(name: string): boolean {
  return VALID_KEY_RE.test(name);
}

/**
 * Rewrites a single key so it matches Anthropic's pattern. Replaces known illegal
 * characters with readable aliases, any remaining illegal character with `_`, and
 * truncates keys over 64 characters with a deterministic hash suffix.
 */
function sanitizeKey(name: string): string {
  let sanitized = name;
  for (const [char, replacement] of Object.entries(ILLEGAL_CHAR_MAP)) {
    sanitized = sanitized.split(char).join(replacement);
  }
  sanitized = sanitized.replace(/[^a-zA-Z0-9_.-]/g, '_');

  if (sanitized.length > MAX_KEY_LENGTH) {
    const suffix = `_${shortHash(name)}`;
    sanitized = sanitized.slice(0, MAX_KEY_LENGTH - suffix.length) + suffix;
  }

  return sanitized;
}

/** Returns a sanitized key guaranteed to be unique within `taken`. */
function uniqueSanitizedKey(name: string, taken: Set<string>): string {
  let candidate = sanitizeKey(name);
  if (!taken.has(candidate)) {
    return candidate;
  }
  // Collision (different originals mapping to the same alias) — append a hash.
  const suffix = `_${shortHash(name)}`;
  const base = candidate.slice(0, MAX_KEY_LENGTH - suffix.length);
  candidate = base + suffix;
  while (taken.has(candidate)) {
    candidate = `${candidate.slice(0, MAX_KEY_LENGTH - 1)}_`;
  }
  return candidate;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively sanitizes the property keys of a JSON-schema node, collecting a
 * sanitized -> original mapping. Only the `properties` of object schemas are
 * traversed, matching how Composio nests its tool parameters.
 *
 * The input node is never mutated; a new node is returned.
 */
function sanitizeNode(node: Record<string, unknown>, mapping: KeyMapping): Record<string, unknown> {
  const result: Record<string, unknown> = { ...node };
  const properties = node.properties;

  if (!isPlainObject(properties)) {
    return result;
  }

  const newProperties: Record<string, unknown> = {};
  const renamed: Record<string, string> = {}; // original -> sanitized (this level)

  // Reserve all already-valid keys up front so they keep their exact names and
  // sanitized aliases are generated around them (a valid `dollar_top` must not be
  // clobbered by a sanitized `$top`).
  const taken = new Set<string>();
  for (const key of Object.keys(properties)) {
    if (isValidKey(key)) {
      taken.add(key);
    }
  }

  for (const [key, rawValue] of Object.entries(properties)) {
    const value = isPlainObject(rawValue) ? sanitizeNode(rawValue, mapping) : rawValue;
    const safeKey = isValidKey(key) ? key : uniqueSanitizedKey(key, taken);

    taken.add(safeKey);
    newProperties[safeKey] = value;

    if (safeKey !== key) {
      renamed[key] = safeKey;
      mapping[safeKey] = key;
    }
  }

  result.properties = newProperties;

  // Keep `required` in sync with the renamed keys at this level.
  if (Array.isArray(node.required)) {
    result.required = node.required.map(name =>
      typeof name === 'string' && renamed[name] ? renamed[name] : name
    );
  }

  return result;
}

/**
 * Sanitizes a tool `input_schema` so all property keys conform to Anthropic's
 * pattern.
 *
 * @param schema - The tool input schema to sanitize.
 * @returns The sanitized schema (a copy) and a `sanitized -> original` key mapping.
 *          The mapping is empty when nothing needed rewriting.
 */
export function sanitizeSchemaPropertyKeys<T extends Record<string, unknown>>(
  schema: T
): { schema: T; mapping: KeyMapping } {
  const mapping: KeyMapping = {};
  const sanitized = sanitizeNode(schema, mapping) as T;
  return { schema: sanitized, mapping };
}

/**
 * Restores original property names in a tool-call argument object using the
 * mapping produced by {@link sanitizeSchemaPropertyKeys}. Nested objects and
 * arrays are walked recursively. Returns a new value; the input is not mutated.
 */
export function restoreOriginalKeys(value: unknown, mapping: KeyMapping): unknown {
  if (Array.isArray(value)) {
    return value.map(item => restoreOriginalKeys(item, mapping));
  }

  if (isPlainObject(value)) {
    const restored: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const originalKey = mapping[key] ?? key;
      restored[originalKey] = restoreOriginalKeys(val, mapping);
    }
    return restored;
  }

  return value;
}
