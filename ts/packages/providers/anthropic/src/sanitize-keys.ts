/**
 * Anthropic-bound tool-schema key sanitization.
 *
 * The traversal/restoration mechanism lives in `@composio/core`
 * (`sanitizeSchemaPropertyKeys` / `restoreOriginalKeys`); this module supplies the
 * Anthropic key constraint as a {@link KeySanitizationPolicy} and re-exports a
 * policy-bound sanitizer plus the restore side, so call sites in this package
 * import everything from one place.
 *
 * Anthropic's Messages API validates every property key against
 * `^[a-zA-Z0-9_.-]{1,64}$` and rejects the entire `tools` array on a single
 * violation. Composio tools can surface keys that break this — OData parameters
 * like `$top` / `@microsoft.graph.conflictBehavior` (illegal `$`/`@`), or
 * over-long `__`-flattened keys.
 *
 * @module providers/anthropic/sanitize-keys
 */
import {
  sanitizeSchemaPropertyKeys as sanitizeWithPolicy,
  restoreOriginalKeys,
  mappingHasRenames,
  type KeyMapping,
  type KeySanitizationPolicy,
} from '@composio/core';

export { restoreOriginalKeys, mappingHasRenames };
export type { KeyMapping };

/** Anthropic's allowed property-key pattern. */
const VALID_KEY_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

/** Maximum length Anthropic accepts for a property key. */
const MAX_KEY_LENGTH = 64;

/**
 * Readable replacements for the two most common illegal characters — the OData
 * prefixes Composio surfaces — so aliases stay recognizable on the wire (e.g.
 * `$top` -> `dollar_top`, `@odata.type` -> `at_odata.type`). Any other illegal
 * character falls back to `_` (see {@link sanitizeKey}).
 */
const ILLEGAL_CHAR_MAP: Record<string, string> = {
  $: 'dollar_',
  '@': 'at_',
};

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

/**
 * Rewrites a single key so it matches Anthropic's pattern. Replaces known illegal
 * characters with readable aliases, any remaining illegal character with `_`,
 * substitutes a non-empty fallback for an otherwise-empty result, and truncates
 * keys over 64 characters with a deterministic hash suffix.
 */
function sanitizeKey(name: string): string {
  let sanitized = name;
  for (const [char, replacement] of Object.entries(ILLEGAL_CHAR_MAP)) {
    sanitized = sanitized.split(char).join(replacement);
  }
  sanitized = sanitized.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Anthropic's pattern requires at least one character; an empty original (or
  // one made entirely of stripped characters) would otherwise emit `''`, which
  // still fails validation. Fall back to a deterministic non-empty alias.
  if (sanitized.length === 0) {
    sanitized = `key_${shortHash(name)}`;
  }

  if (sanitized.length > MAX_KEY_LENGTH) {
    const suffix = `_${shortHash(name)}`;
    sanitized = sanitized.slice(0, MAX_KEY_LENGTH - suffix.length) + suffix;
  }

  return sanitized;
}

/** The Anthropic key-sanitization policy consumed by core's sanitizer. */
const anthropicKeyPolicy: KeySanitizationPolicy = {
  isValidKey(name) {
    return VALID_KEY_RE.test(name);
  },

  aliasKey(name, taken) {
    const candidate = sanitizeKey(name);
    if (!taken.has(candidate)) {
      return candidate;
    }
    // Collision (different originals mapping to the same alias) — append a hash,
    // then an incrementing counter if that still collides. The counter changes
    // every iteration, so this always makes progress and can't spin.
    const suffix = `_${shortHash(name)}`;
    const base = candidate.slice(0, MAX_KEY_LENGTH - suffix.length);
    let resolved = base + suffix;
    for (let counter = 1; taken.has(resolved); counter++) {
      const tail = `${suffix}_${counter}`;
      resolved = base.slice(0, MAX_KEY_LENGTH - tail.length) + tail;
    }
    return resolved;
  },
};

/**
 * Sanitizes a tool `input_schema` so every property key satisfies Anthropic's
 * `^[a-zA-Z0-9_.-]{1,64}$` constraint, returning the rewritten schema and a
 * {@link KeyMapping} for restoring the original keys at execution time.
 *
 * `inputParameters` should be dereferenced first (see `wrapTool`) so keys that
 * are reachable only through a `$ref` are sanitized and restored as well.
 */
export function sanitizeSchemaPropertyKeys<T extends Record<string, unknown>>(
  schema: T
): { schema: T; mapping: KeyMapping } {
  return sanitizeWithPolicy(schema, anthropicKeyPolicy);
}
