import type { ZodType, ZodTypeAny } from 'zod/v3';

import { zodV3Backend } from './backend/zod-v3';
import { createConverter } from './convert';
import type { JsonSchemaToZodOptions, JsonSchema } from './types';

const converter = createConverter(zodV3Backend);

export const jsonSchemaToZod = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): ZodType => converter.jsonSchemaToZod(schema, options);

/**
 * A simplified type for Zod raw shapes that avoids deep type instantiation issues.
 * This is compatible with ZodRawShape but uses a simpler type signature.
 */
export type SimpleZodRawShape = Record<string, ZodTypeAny>;

/**
 * Converts a JSON Schema object to a Zod raw shape.
 * This is useful when you need the shape object (e.g., `{ name: z.string(), age: z.number() }`)
 * rather than a complete ZodObject schema.
 *
 * This is particularly useful for APIs that expect ZodRawShape instead of ZodType,
 * such as the Claude Agent SDK's `tool()` function.
 *
 * @param schema - The JSON Schema to convert (must be an object schema)
 * @param options - Optional configuration for the conversion
 * @returns A Zod raw shape object with property keys mapped to Zod types
 */
export const jsonSchemaToZodShape = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): SimpleZodRawShape => converter.jsonSchemaToZodShape(schema, options);
