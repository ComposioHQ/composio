import type { z, ZodTypeAny } from 'zod/v3';

import { parseSchema } from './parsers/parse-schema';
import { parseObjectShape } from './parsers/parse-object-shape';
import type { JsonSchemaToZodOptions, JsonSchema, JsonSchemaObject } from './types';

export const jsonSchemaToZod = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): z.ZodType => {
  return parseSchema(schema, {
    path: [],
    seen: new Map(),
    ...options,
  });
};

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
): SimpleZodRawShape => {
  if (typeof schema !== 'object' || schema === null) {
    return {};
  }

  const objectSchema = schema as JsonSchemaObject;

  return parseObjectShape(objectSchema, {
    path: [],
    seen: new Map(),
    ...options,
  });
};
