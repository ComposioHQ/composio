import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';
import {
  createWholeSchemaGuard,
  guardSchemaAt,
  requiresWholeSchemaValidation,
} from '../whole-schema-validation';

/**
 * Parses a JSON Schema object and returns the raw shape (property keys mapped to Zod types).
 * This is useful when you need ZodRawShape instead of a complete ZodObject.
 *
 * @param objectSchema - The JSON Schema object to parse
 * @param ctx - Parser context for handling nested schemas
 * @returns A Zod raw shape object
 */
export function parseObjectShape<S>(
  objectSchema: JsonSchemaObject,
  ctx: ParseContext<S>
): Record<string, S> {
  if (!objectSchema.properties) {
    return {};
  }

  const propertyKeys = Object.keys(objectSchema.properties);
  if (propertyKeys.length === 0) {
    return {};
  }

  const { backend } = ctx;
  const properties: Record<string, S> = {};

  for (const key of propertyKeys) {
    const propJsonSchema = objectSchema.properties[key];
    const propCtx = {
      ...ctx,
      root: ctx.root ?? objectSchema,
      path: [...ctx.path, 'properties', key],
    };

    const parsedProperty = parseSchema(propJsonSchema, propCtx);
    const propZodSchema = requiresWholeSchemaValidation(propJsonSchema)
      ? backend.attachGuard(
          parsedProperty,
          createWholeSchemaGuard(guardSchemaAt(propJsonSchema, propCtx))
        )
      : parsedProperty;

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
          properties[key] = backend.withDefault(backend.optional(propZodSchema), null);
        } else {
          // Make the field nullable with the null default
          properties[key] = backend.withDefault(
            backend.optional(backend.nullable(propZodSchema)),
            null
          );
        }
      } else {
        properties[key] = backend.withDefault(
          backend.optional(propZodSchema),
          propJsonSchema.default
        );
      }
    } else {
      properties[key] = required ? propZodSchema : backend.optional(propZodSchema);
    }
  }

  return properties;
}
