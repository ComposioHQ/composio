import * as z from 'zod/v3';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';

/**
 * Parses a JSON Schema object and returns the raw shape (property keys mapped to Zod types).
 * This is useful when you need ZodRawShape instead of a complete ZodObject.
 *
 * @param objectSchema - The JSON Schema object to parse
 * @param refs - Parser references for handling nested schemas
 * @returns A Zod raw shape object
 */
export function parseObjectShape(objectSchema: JsonSchemaObject, refs: Refs): z.ZodRawShape {
  if (!objectSchema.properties) {
    return {};
  }

  const propertyKeys = Object.keys(objectSchema.properties);
  if (propertyKeys.length === 0) {
    return {};
  }

  const properties: z.ZodRawShape = {};

  for (const key of propertyKeys) {
    const propJsonSchema = objectSchema.properties[key];

    const propZodSchema = parseSchema(propJsonSchema, {
      ...refs,
      path: [...refs.path, 'properties', key],
    });

    const required = Array.isArray(objectSchema.required)
      ? objectSchema.required.includes(key)
      : false;

    // Handle default values for optional properties
    if (
      !required &&
      propJsonSchema &&
      typeof propJsonSchema === 'object' &&
      'default' in propJsonSchema
    ) {
      // If default is null, make the field nullable with the null default
      // But don't make it nullable if it's already an anyOf/oneOf that includes null
      if (propJsonSchema.default === null) {
        const hasAnyOfWithNull =
          propJsonSchema.anyOf &&
          Array.isArray(propJsonSchema.anyOf) &&
          propJsonSchema.anyOf.some(
            (schema: JsonSchema) =>
              typeof schema === 'object' && schema !== null && schema.type === 'null'
          );
        const hasOneOfWithNull =
          propJsonSchema.oneOf &&
          Array.isArray(propJsonSchema.oneOf) &&
          propJsonSchema.oneOf.some(
            (schema: JsonSchema) =>
              typeof schema === 'object' && schema !== null && schema.type === 'null'
          );
        const isNullable =
          'nullable' in propJsonSchema &&
          (propJsonSchema as JsonSchemaObject & { nullable?: boolean }).nullable === true;

        if (hasAnyOfWithNull || hasOneOfWithNull || isNullable) {
          // The schema already handles null through anyOf/oneOf/nullable, just make it optional with default
          properties[key] = propZodSchema.optional().default(null);
        } else {
          // Make the field nullable with the null default
          properties[key] = propZodSchema.nullable().optional().default(null);
        }
      } else {
        properties[key] = propZodSchema.optional().default(propJsonSchema.default);
      }
    } else {
      properties[key] = required ? propZodSchema : propZodSchema.optional();
    }
  }

  return properties;
}
