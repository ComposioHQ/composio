import { dereferenceJsonSchema } from '@composio/core/utils/json-schema';
import { Effect } from 'effect';
import { GenerateTypeFromJsonSchemaError } from 'src/generation/errors';
import { printTypeFromJsonSchema, type PrintTypeOptions } from './json-schema-type';

export { GenerateTypeFromJsonSchemaError };

/**
 * `type <name> = …;` for the `properties` of a tool or trigger schema. A schema
 * the printer cannot read (a keyword with the wrong JSON type) fails with
 * `GenerateTypeFromJsonSchemaError`.
 *
 * Local `$ref` pointers (into the schema's `$defs`) are inlined the way the SDK
 * inlines them at runtime; a missing target or a cycle becomes a permissive object.
 * A schema whose references expand past core's caps keeps them, and the printer
 * types each one as `unknown`.
 */
export function generateTypeFromJsonSchema(
  name: string,
  schema: { readonly [x: string]: unknown },
  options: PrintTypeOptions = { comments: true }
) {
  return Effect.try({
    try: () => dereferenceJsonSchema(schema, { onUnresolved: 'sentinel' }),
    catch: cause => (cause instanceof Error ? cause.message : String(cause)),
  }).pipe(
    Effect.catch(reason =>
      Effect.logWarning(`${name}: ${reason}; its references are typed as unknown`).pipe(
        Effect.as(schema)
      )
    ),
    Effect.flatMap(inlined =>
      Effect.try({
        // The Composio API returns schemas whose discriminator.mapping points to #/$defs/...
        // paths while the variants are inlined in oneOf/anyOf arrays. A union needs no
        // discriminator, so it is removed.
        try: () =>
          printTypeFromJsonSchema(name, removeDiscriminators(inlined['properties']), options),
        catch: cause =>
          new GenerateTypeFromJsonSchemaError({
            cause,
            message: 'Failed to generate type from JSON schema',
          }),
      })
    )
  );
}

/**
 * Recursively removes OpenAPI `discriminator` objects from a JSON schema.
 * This is needed because Composio's API returns schemas with discriminator.mapping
 * that reference #/$defs/... paths, but the types are inlined in oneOf/anyOf arrays
 * rather than defined in a $defs section. openapi-typescript fails to resolve these refs.
 * Since oneOf/anyOf work fine without discriminator, we simply remove it.
 *
 * IMPORTANT: We only remove `discriminator` keys when the value is an actual OpenAPI
 * discriminator object (identified by having a `propertyName` field per the OpenAPI spec).
 * This avoids accidentally stripping user-defined properties that happen to be named "discriminator".
 */
export function removeDiscriminators(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeDiscriminators);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'discriminator' && isOpenApiDiscriminator(value)) {
      // Skip OpenAPI discriminator objects (must have `propertyName` per spec)
      continue;
    }
    result[key] = removeDiscriminators(value);
  }
  return result;
}

/**
 * Checks if a value is an OpenAPI discriminator object.
 * Per the OpenAPI 3.0/3.1 spec, a discriminator object MUST have a `propertyName` field.
 * @see https://spec.openapis.org/oas/v3.1.0#discriminator-object
 */
function isOpenApiDiscriminator(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'propertyName' in value &&
    typeof (value as Record<string, unknown>)['propertyName'] === 'string'
  );
}
