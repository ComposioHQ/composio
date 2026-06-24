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
 * The reverse mapping mirrors the schema's nesting (object `properties` and array
 * `items`) rather than being a single flat lookup. This matters because an alias
 * generated at one nesting level (e.g. `$top` -> `dollar_top`) must not rewrite a
 * legitimately-named `dollar_top` key that happens to exist at a different level.
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

/**
 * Reverse mapping used to restore original property names at execution time.
 *
 * It is shaped like the schema it was derived from so restoration is scoped to
 * the exact location a rename happened:
 *  - `renames` — `sanitized -> original` for keys renamed at *this* object level.
 *  - `children` — restoration mapping for the value under each (sanitized) key,
 *    keyed by the sanitized key. Only present for children that contain renames.
 *  - `items` — restoration mapping for array element values. A single mapping
 *    applies to every element; an array of mappings applies positionally (JSON
 *    Schema tuple validation). Only present when array elements contain renames.
 */
export interface KeyMapping {
  renames: Record<string, string>;
  children: Record<string, KeyMapping>;
  items?: KeyMapping | (KeyMapping | null)[];
}

/** Whether a mapping (or any of its descendants) actually renames a key. */
export function mappingHasRenames(mapping: KeyMapping): boolean {
  // `children` and `items` are only populated when they carry renames (see
  // `sanitizeNode`), so this stays a shallow check.
  return (
    Object.keys(mapping.renames).length > 0 ||
    Object.keys(mapping.children).length > 0 ||
    mapping.items != null
  );
}

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
 * Recursively sanitizes the property keys of a JSON-schema node, returning the
 * rewritten node and a {@link KeyMapping} shaped like the node. Both object
 * `properties` and array `items` schemas are traversed, matching how Composio
 * nests its tool parameters.
 *
 * The input node is never mutated; a new node is returned.
 */
function sanitizeNode(node: Record<string, unknown>): {
  node: Record<string, unknown>;
  mapping: KeyMapping;
} {
  const result: Record<string, unknown> = { ...node };
  const renames: Record<string, string> = {};
  const children: Record<string, KeyMapping> = {};
  let items: KeyMapping | (KeyMapping | null)[] | undefined;

  const properties = node.properties;
  if (isPlainObject(properties)) {
    const newProperties: Record<string, unknown> = {};
    const renamedOriginalToSanitized: Record<string, string> = {};

    // Reserve all already-valid keys up front so they keep their exact names and
    // sanitized aliases are generated around them (a valid `dollar_top` must not
    // be clobbered by a sanitized `$top`).
    const taken = new Set<string>();
    for (const key of Object.keys(properties)) {
      if (isValidKey(key)) {
        taken.add(key);
      }
    }

    for (const [key, rawValue] of Object.entries(properties)) {
      const safeKey = isValidKey(key) ? key : uniqueSanitizedKey(key, taken);
      taken.add(safeKey);

      const child = isPlainObject(rawValue) ? sanitizeNode(rawValue) : null;
      newProperties[safeKey] = child ? child.node : rawValue;
      if (child && mappingHasRenames(child.mapping)) {
        children[safeKey] = child.mapping;
      }

      if (safeKey !== key) {
        renames[safeKey] = key;
        renamedOriginalToSanitized[key] = safeKey;
      }
    }

    result.properties = newProperties;

    // Keep `required` in sync with the renamed keys at this level.
    if (Array.isArray(node.required)) {
      result.required = node.required.map(name =>
        typeof name === 'string' && renamedOriginalToSanitized[name]
          ? renamedOriginalToSanitized[name]
          : name
      );
    }
  }

  // Recurse into array element schemas so illegal keys nested inside array items
  // (e.g. `{ type: 'array', items: { properties: { $top: ... } } }`) are sanitized
  // too — `properties`-only traversal would let them through and still 400.
  const itemsSchema = node.items;
  if (isPlainObject(itemsSchema)) {
    const child = sanitizeNode(itemsSchema);
    result.items = child.node;
    if (mappingHasRenames(child.mapping)) {
      items = child.mapping;
    }
  } else if (Array.isArray(itemsSchema)) {
    // Tuple validation: one positional schema per array index.
    const sanitizedItems: unknown[] = [];
    const itemMappings: (KeyMapping | null)[] = [];
    let anyRenamed = false;
    for (const entry of itemsSchema) {
      if (isPlainObject(entry)) {
        const child = sanitizeNode(entry);
        sanitizedItems.push(child.node);
        if (mappingHasRenames(child.mapping)) {
          itemMappings.push(child.mapping);
          anyRenamed = true;
        } else {
          itemMappings.push(null);
        }
      } else {
        sanitizedItems.push(entry);
        itemMappings.push(null);
      }
    }
    result.items = sanitizedItems;
    if (anyRenamed) {
      items = itemMappings;
    }
  }

  const mapping: KeyMapping = { renames, children };
  if (items !== undefined) {
    mapping.items = items;
  }

  return { node: result, mapping };
}

/**
 * Sanitizes a tool `input_schema` so all property keys conform to Anthropic's
 * pattern.
 *
 * @param schema - The tool input schema to sanitize.
 * @returns The sanitized schema (a copy) and a {@link KeyMapping} for restoring
 *          the original keys. Use {@link mappingHasRenames} to tell whether
 *          anything was rewritten.
 */
export function sanitizeSchemaPropertyKeys<T extends Record<string, unknown>>(
  schema: T
): { schema: T; mapping: KeyMapping } {
  const { node, mapping } = sanitizeNode(schema);
  return { schema: node as T, mapping };
}

/**
 * Restores original property names in a tool-call argument object using the
 * mapping produced by {@link sanitizeSchemaPropertyKeys}. The mapping is walked
 * in lockstep with the value, so a key is only renamed at the nesting level where
 * its alias was actually generated. Nested objects and arrays are handled
 * recursively. Returns a new value; the input is not mutated.
 */
export function restoreOriginalKeys(value: unknown, mapping: KeyMapping): unknown {
  if (Array.isArray(value)) {
    const { items } = mapping;
    if (Array.isArray(items)) {
      return value.map((item, index) => {
        const itemMapping = items[index];
        return itemMapping ? restoreOriginalKeys(item, itemMapping) : item;
      });
    }
    if (items) {
      return value.map(item => restoreOriginalKeys(item, items));
    }
    return value;
  }

  if (isPlainObject(value)) {
    const restored: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const originalKey = mapping.renames[key] ?? key;
      const childMapping = mapping.children[key];
      restored[originalKey] = childMapping ? restoreOriginalKeys(val, childMapping) : val;
    }
    return restored;
  }

  return value;
}
