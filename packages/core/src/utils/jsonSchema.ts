import { z } from 'zod';
import { JsonSchemaToZodError } from '../errors';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';

/**
 * Removes all non-required properties from the schema
 *
 * if no items are required, the schema is returned as is
 * @param schema - The JSON schema to remove non-required properties from
 * @returns The JSON schema with all non-required properties removed
 */
export const removeNonRequiredProperties = <
  T extends { type: 'object'; properties: Record<string, unknown>; required?: string[] },
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
export function jsonSchemaToZodSchema(
  jsonSchema: Record<string, unknown>,
  { strict }: { strict?: boolean } = {
    strict: false,
  }
): z.ZodTypeAny {
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
    const zodSchema = jsonSchemaToZod(schema) as z.ZodTypeAny;
    return zodSchema;
  } catch (error) {
    throw new JsonSchemaToZodError('Failed to convert JSON Schema to Zod Schema', {
      cause: error,
    });
  }
}
