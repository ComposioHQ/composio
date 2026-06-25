/**
 * Output-schema leniency for the Mastra provider.
 *
 * Mastra validates every tool result against the tool's `outputSchema` via
 * `validateToolOutput`; on a mismatch it drops the data and substitutes an
 * error. Composio's API-supplied output schemas, however, are strict: optional
 * fields are typed as non-nullable primitives (`{ type: 'string' }`) and
 * objects carry `additionalProperties: false`. Real third-party APIs (Linear,
 * Notion, Jira, Slack, …) routinely return `null` for unset optional fields and
 * occasionally extra keys, so strict validation rejects perfectly good
 * responses and truncates the tool output the model sees.
 *
 * Output validation of opaque third-party pass-through payloads provides little
 * value and causes real breakage, so we relax the output schema before handing
 * it to `@mastra/schema-compat`:
 *
 *  - every typed node is made nullable (`type: 'string'` → `['string', 'null']`)
 *  - objects with `additionalProperties: false` (or unset) allow extra keys
 *  - `enum`/`const` are widened to also admit `null` — they constrain the
 *    *value* independently of `type`, so making the type nullable is not enough
 *  - `required` is dropped, since real APIs omit unset fields entirely rather
 *    than returning `null` for them, so requiring any field rejects good output
 *
 * All four changes only *widen* what validates, so any payload that passed
 * before still passes — there is no behavioural change for already-valid output.
 *
 * See https://github.com/ComposioHQ/composio/issues/3047.
 */

// JSON-Schema keywords whose values are themselves schemas and sit in a
// *positive* position, so relaxing them widens the parent (recurse into them).
//
// `not` is deliberately excluded: it negates its subschema, so relaxing the
// inner schema (e.g. making it nullable) would *narrow* what the parent admits —
// a `null` valid under `not: { type: 'string' }` would start failing. That is
// the opposite of this helper's only-widen guarantee, so `not` is left as-is.
const SUBSCHEMA_KEYS = ['items', 'additionalItems', 'contains'] as const;
// Keywords whose values are arrays of schemas.
const SUBSCHEMA_LIST_KEYS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const;
// Keywords whose values are maps of name -> schema.
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addNullToType(type: unknown): unknown {
  if (typeof type === 'string') {
    return type === 'null' ? type : [type, 'null'];
  }
  if (Array.isArray(type)) {
    return type.includes('null') ? type : [...type, 'null'];
  }
  return type;
}

/**
 * Recursively returns a leniency-relaxed copy of a JSON schema for use as a
 * Mastra `outputSchema`. The input is never mutated.
 */
export function relaxOutputSchema<T>(schema: T): T {
  if (!isPlainObject(schema)) return schema;

  const result: Record<string, unknown> = { ...schema };

  // Decide object-ness from the *original* type before it is rewritten below.
  const originalType = result.type;
  const isObjectSchema =
    originalType === 'object' ||
    (Array.isArray(originalType) && originalType.includes('object')) ||
    'properties' in result ||
    'patternProperties' in result;

  // Make any typed node nullable so a `null` from the upstream API validates.
  if ('type' in result) {
    result.type = addNullToType(result.type);
  }

  // `enum`/`const` restrict the value regardless of `type`, so a nullable type
  // alone would still reject a `null`. Widen them to admit `null` too; `const`
  // (a single allowed value) becomes a two-member nullable `enum`.
  if ('const' in result) {
    result.enum = [result.const, null];
    delete result.const;
  } else if (Array.isArray(result.enum) && !result.enum.includes(null)) {
    result.enum = [...result.enum, null];
  }

  // Drop `required`: third-party APIs omit unset fields entirely (not just
  // return `null`), so requiring any field would reject otherwise-valid output.
  if ('required' in result) {
    delete result.required;
  }

  // Allow extra keys on objects that forbid (or omit) additional properties.
  // A sub-schema value is preserved and recursed into instead of overwritten.
  if (isPlainObject(result.additionalProperties)) {
    result.additionalProperties = relaxOutputSchema(result.additionalProperties);
  } else if (
    isObjectSchema &&
    (result.additionalProperties === false || result.additionalProperties === undefined)
  ) {
    result.additionalProperties = true;
  }

  for (const key of SUBSCHEMA_KEYS) {
    if (key in result) result[key] = relaxOutputSchema(result[key]);
  }

  for (const key of SUBSCHEMA_LIST_KEYS) {
    const value = result[key];
    if (Array.isArray(value)) {
      result[key] = value.map(entry => relaxOutputSchema(entry));
    }
  }

  for (const key of SUBSCHEMA_MAP_KEYS) {
    const value = result[key];
    if (isPlainObject(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, relaxOutputSchema(sub)])
      );
    }
  }

  return result as T;
}
