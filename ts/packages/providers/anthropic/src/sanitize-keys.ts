/**
 * @file Utilities for sanitizing JSON schema property keys to comply with
 *       Anthropic's API constraint: property keys must match ^[a-zA-Z0-9_.-]{1,64}$
 * @module providers/anthropic/sanitize-keys
 */

const MAX_KEY_LENGTH = 64;
const HASH_SUFFIX_LENGTH = 7;
const TRUNCATED_PREFIX_LENGTH = MAX_KEY_LENGTH - 1 - HASH_SUFFIX_LENGTH; // 56

/**
 * Deterministic short hash using djb2.
 * Returns a 7-character lowercase hex string.
 */
function shortHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(HASH_SUFFIX_LENGTH, '0').slice(-HASH_SUFFIX_LENGTH);
}

function truncateKey(key: string): string {
  if (key.length <= MAX_KEY_LENGTH) {
    return key;
  }
  return `${key.slice(0, TRUNCATED_PREFIX_LENGTH)}_${shortHash(key)}`;
}

interface InputSchemaLike {
  type: 'object';
  properties?: Record<string, unknown> | null;
  required?: string[];
  [k: string]: unknown;
}

export interface SanitizeResult {
  schema: InputSchemaLike;
  keyMap: Map<string, string>;
}

/**
 * Sanitize property keys in an input schema to fit Anthropic's 64-char limit.
 * Returns the (possibly unchanged) schema and a reverse mapping
 * (sanitized key -> original key) for restoring keys during tool execution.
 */
export function sanitizeSchemaPropertyKeys(schema: InputSchemaLike): SanitizeResult {
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

  const newRequired = schema.required?.map(key => truncateKey(key));

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
 * Restore original property keys in tool call arguments.
 * Keys not in the mapping pass through unchanged.
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
