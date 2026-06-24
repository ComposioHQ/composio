/**
 * Anthropic-bound tool-schema key sanitization.
 *
 * The traversal/restoration mechanism lives in `@composio/core`
 * (`sanitizeSchemaPropertyKeys` / `restoreOriginalKeys`); this module binds it to
 * the Anthropic key constraint ({@link anthropicKeyPolicy}) and re-exports the
 * restore side so call sites in this package import everything from one place.
 *
 * @module providers/anthropic/sanitize-keys
 */
import {
  sanitizeSchemaPropertyKeys as sanitizeWithPolicy,
  restoreOriginalKeys,
  mappingHasRenames,
  type KeyMapping,
} from '@composio/core';
import { anthropicKeyPolicy } from './key-policy';

export { restoreOriginalKeys, mappingHasRenames };
export type { KeyMapping };

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
