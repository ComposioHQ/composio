import { z } from 'zod';
import { JsonSchemaToZodError } from '../errors';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';

/**
 * Convert a JSON schema to a Zod schema
 * @param jsonSchema - The JSON schema to convert
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
 */
export function jsonSchemaToZodSchema(
  jsonSchema: Record<string, unknown>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  try {
    // Convert the JSON schema properties to Zod schema
    return jsonSchemaToZod(jsonSchema);
  } catch (error) {
    throw new JsonSchemaToZodError('Failed to convert JSON Schema to Zod Schema', {
      cause: error,
    });
  }
}
