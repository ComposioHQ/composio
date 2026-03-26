import { z } from 'zod/v3';
import { JsonSchemaToZodError } from '../errors';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';

const SCHEMA_OBJECT_KEYS = [
  '$defs',
  'definitions',
  'dependentSchemas',
  'patternProperties',
  'properties',
] as const;

const SCHEMA_ARRAY_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;

const SCHEMA_SINGLE_KEYS = [
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
] as const;

/**
 * Recursively deduplicates entries in `required` arrays throughout a JSON schema.
 *
 * JSON Schema 2020-12 requires `required` items to be unique. Some upstream
 * schemas violate this, which causes strict validators to reject the schema.
 *
 * @param schema - A JSON schema or sub-schema to sanitize
 * @returns A sanitized copy of the schema
 */
export const deduplicateRequiredFields = <T>(schema: T): T => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }

  const result = { ...(schema as Record<string, unknown>) };

  if (Array.isArray(result.required)) {
    result.required = [...new Set(result.required)];
  }

  for (const key of SCHEMA_OBJECT_KEYS) {
    const value = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([childKey, childSchema]) => [
          childKey,
          deduplicateRequiredFields(childSchema),
        ])
      );
    }
  }

  for (const key of SCHEMA_ARRAY_KEYS) {
    const value = result[key];
    if (Array.isArray(value)) {
      result[key] = value.map(item => deduplicateRequiredFields(item));
    }
  }

  for (const key of SCHEMA_SINGLE_KEYS) {
    const value = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deduplicateRequiredFields(value);
    }
  }

  return result as T;
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
    let schema = deduplicateRequiredFields(jsonSchema);
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
