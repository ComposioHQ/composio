/**
 * @file Utilities for sanitizing JSON schema property keys to comply with
 *       Anthropic's API constraint: property keys must match ^[a-zA-Z0-9_.-]{1,64}$
 * @module providers/anthropic/sanitize-keys
 */

/**
 * Maximum allowed length for Anthropic tool input schema property keys.
 * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 */
const MAX_KEY_LENGTH = 64;

/**
 * Length of the hash suffix used when truncating keys.
 * Format: `_` + 7 hex chars = 8 chars total overhead.
 */
const HASH_SUFFIX_LENGTH = 7;

/**
 * Truncation prefix length: MAX_KEY_LENGTH - 1 (underscore) - HASH_SUFFIX_LENGTH
 */
const TRUNCATED_PREFIX_LENGTH = MAX_KEY_LENGTH - 1 - HASH_SUFFIX_LENGTH;

/**
 * Simple string hash that produces a short, deterministic hex string.
 * Uses djb2 algorithm for speed and reasonable distribution.
 *
 * @param str - The string to hash
 * @returns A 7-character lowercase hex string
 */
function shortHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(HASH_SUFFIX_LENGTH, '0').slice(-HASH_SUFFIX_LENGTH);
}

/**
 * Truncate a property key to fit within the 64-character limit.
 * Keys within the limit are returned unchanged.
 * Keys exceeding the limit are truncated to 56 chars + '_' + 7-char hash.
 *
 * @param key - The original property key
 * @returns The sanitized key (at most 64 characters)
 */
function truncateKey(key: string): string {
  if (key.length <= MAX_KEY_LENGTH) {
    return key;
  }
  return `${key.slice(0, TRUNCATED_PREFIX_LENGTH)}_${shortHash(key)}`;
}

/**
 * Result of sanitizing an input schema's property keys.
 */
export interface SanitizedSchema {
  /** The schema with all property keys truncated to <= 64 chars */
  schema: InputSchemaLike;
  /** Map from sanitized key -> original key (only contains entries for keys that were changed) */
  keyMap: Map<string, string>;
}

/**
 * Minimal interface for an input schema object.
 */
interface InputSchemaLike {
  type: 'object';
  properties?: Record<string, unknown> | null;
  required?: string[];
  [k: string]: unknown;
}

/**
 * Sanitize all property keys in an input schema to comply with Anthropic's
 * 64-character limit. Returns the sanitized schema and a reverse mapping
 * so that tool call arguments can be mapped back to their original keys.
 *
 * @param schema - The original input schema
 * @returns The sanitized schema and a key mapping for reverse lookup
 *
 * @example
 * ```ts
 * const { schema, keyMap } = sanitizeSchemaPropertyKeys({
 *   type: 'object',
 *   properties: {
 *     'settings__approved__or__denied__countries__or__regions__approved__list': { type: 'string' },
 *     'short_key': { type: 'string' },
 *   },
 *   required: ['settings__approved__or__denied__countries__or__regions__approved__list'],
 * });
 *
 * // schema.properties will have the truncated key
 * // keyMap will map truncated -> original
 * ```
 */
export function sanitizeSchemaPropertyKeys(schema: InputSchemaLike): SanitizedSchema {
  const keyMap = new Map<string, string>();

  if (!schema || !schema.properties) {
    return { schema, keyMap };
  }

  const originalProperties = schema.properties;
  const newProperties: Record<string, unknown> = {};
  let hasChanges = false;

  for (const [originalKey, value] of Object.entries(originalProperties)) {
    const sanitizedKey = truncateKey(originalKey);
    newProperties[sanitizedKey] = value;

    if (sanitizedKey !== originalKey) {
      keyMap.set(sanitizedKey, originalKey);
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return { schema, keyMap };
  }

  // Update the required array to use sanitized keys
  let newRequired = schema.required;
  if (schema.required && schema.required.length > 0) {
    newRequired = schema.required.map(key => {
      const sanitized = truncateKey(key);
      return sanitized;
    });
  }

  return {
    schema: {
      ...schema,
      properties: newProperties,
      required: newRequired,
    },
    keyMap,
  };
}

/**
 * Restore original property keys in a tool call's input arguments.
 * Keys not found in the mapping are passed through unchanged.
 *
 * @param input - The tool call input with potentially sanitized keys
 * @param keyMap - The reverse mapping from sanitized key -> original key
 * @returns The input with original keys restored
 */
export function restoreOriginalKeys(
  input: Record<string, unknown>,
  keyMap: Map<string, string>
): Record<string, unknown> {
  if (keyMap.size === 0) {
    return input;
  }

  const restored: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const originalKey = keyMap.get(key) ?? key;
    restored[originalKey] = value;
  }
  return restored;
}
