import { parseSchema } from './parse-schema';
import { applyPropertyPresence } from './property-presence';
import type { ParseContext } from '../context';
import type { JsonSchemaObject } from '../types';
import {
  createWholeSchemaGuard,
  guardSchemaAt,
  requiresPermissiveMaterialization,
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
    // A permissive property (`$ref`, typeless constraints) already carries the
    // identical guard from the permissive branch of `selectParser`; attaching
    // again would run two full interpretations of the document per parse. A
    // `parserOverride` result skips `selectParser`, so with an override in
    // play the property keeps its own guard.
    const carriesGuard =
      ctx.parserOverride === undefined && requiresPermissiveMaterialization(propJsonSchema);
    const propZodSchema =
      requiresWholeSchemaValidation(propJsonSchema) && !carriesGuard
        ? backend.attachGuard(
            parsedProperty,
            createWholeSchemaGuard(guardSchemaAt(propJsonSchema, propCtx))
          )
        : parsedProperty;

    const required = Array.isArray(objectSchema.required)
      ? objectSchema.required.includes(key)
      : false;

    properties[key] = applyPropertyPresence(backend, propJsonSchema, propZodSchema, required);
  }

  return properties;
}
