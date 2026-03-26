import { z } from 'zod/v3';
import { JsonSchemaToZodError } from '../errors';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';

/**
 * Recursively deduplicates entries in `required` arrays throughout a JSON schema.
 *
 * JSON Schema 2020-12 §6.5.3 mandates that elements of `required` must be unique.
 * Some upstream schemas violate this, which causes strict validators (e.g. the
 * Anthropic Claude API) to reject the entire tool batch.
 *
 * @param schema - A JSON schema (or sub-schema) to sanitize
 * @returns The same schema structure with all `required` arrays deduplicated
 */
export const deduplicateRequiredFields = <T extends Record<string, unknown>>(schema: T): T => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const result = { ...schema };

  // Deduplicate top-level `required` array
  if (Array.isArray(result.required)) {
    result.required = [...new Set(result.required as string[])];
  }

  // Recurse into `properties`
  if (result.properties && typeof result.properties === 'object') {
    const props = result.properties as Record<string, Record<string, unknown>>;
    result.properties = Object.fromEntries(
      Object.entries(props).map(([key, prop]) => [key, deduplicateRequiredFields(prop)])
    );
  }

  // Recurse into `items` (for array schemas)
  if (result.items && typeof result.items === 'object' && !Array.isArray(result.items)) {
    result.items = deduplicateRequiredFields(result.items as Record<string, unknown>);
  }

  // Recurse into combiners: allOf, anyOf, oneOf
  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(result[combiner])) {
      result[combiner] = (result[combiner] as Record<string, unknown>[]).map(sub =>
        deduplicateRequiredFields(sub)
      );
    }
  }

  return result;
};

/**
 * Removes all non-required properties from the schema
 *
 * if no items are required, the schema is returned as is
 * @param schema - The JSON schema to remove non-required properties from
 * @returns The JSON schema with all non-required properties removed
 */
export const removeNonRequiredProperties = <
  T extends {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  },
>(
  schema: T
): T => {
  if (schema && schema.type === 'object' && (schema.required as string[])?.length) {
    schema.properties = Object.fromEntries(
      Object.entries(schema.properties || {}).filter(([key]) =>
        (schema.required as string[]).includes(key)
      )
    );
  }
  // In strict mode, we don't allow additional properties
  schema.additionalProperties = false;
  return schema as T;
};

/**
 * Convert a JSON schema to a Zod schema
 * @param jsonSchema - The JSON schema to convert
 * @param strict - Eliminates all non-required properties from the schema
 * @returns The Zod schema
 *
 * @throws {JsonSchemaToZodError} If the JSON schema is invalid
 *
 * @example
 * ```ts
 * const zodSchema = jsonSchemaToZodSchema({
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *   },
 * });
 *
 * console.log(zodSchema);
 * ```
 *
 * @example
 * ```ts
 * const zodSchema = jsonSchemaToZodSchema({
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' },
 *   },
 *   required: ['name'],
 * }, { strict: true });
 *
 * console.log(zodSchema);
 *
 * // Output:
 * // z.object({
 * //   name: z.string(),
 * // })
 * ```
 */
export function jsonSchemaToZodSchema<T extends z.ZodTypeAny>(
  jsonSchema: Record<string, unknown>,
  { strict }: { strict?: boolean } = {
    strict: false,
  }
): T {
  try {
    let schema = jsonSchema;
    // Remove all non-required properties from the schema if strict is true
    if (strict && schema) {
      schema = removeNonRequiredProperties(
        schema as {
          type: 'object';
          properties: Record<string, unknown>;
          required?: string[] | undefined;
        }
      );
    }
    // Convert the JSON schema properties to Zod schema
    const zodSchema = jsonSchemaToZod(schema) as T;
    return zodSchema;
  } catch (error) {
    throw new JsonSchemaToZodError('Failed to convert JSON Schema to Zod Schema', {
      cause: error,
    });
  }
}
