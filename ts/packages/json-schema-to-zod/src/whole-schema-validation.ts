import { Validator } from '@cfworker/json-schema';
import type { Schema as InterpreterSchema } from '@cfworker/json-schema';
import { z } from 'zod/v3';

import type { JsonSchema, JsonSchemaObject } from './types';

const REQUIRES_WHOLE_SCHEMA_VALIDATION = new Set([
  '$ref',
  'additionalItems',
  'allOf',
  'anyOf',
  'contains',
  'dependencies',
  'else',
  'if',
  'maxProperties',
  'minProperties',
  'not',
  'oneOf',
  'propertyNames',
  'then',
  'uniqueItems',
]);

const TYPELESS_TYPE_SCOPED_KEYWORDS = new Set([
  'properties',
  'patternProperties',
  'additionalProperties',
  'propertyNames',
  'required',
  'dependencies',
  'minProperties',
  'maxProperties',
  'items',
  'additionalItems',
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
]);

const SCHEMA_MAP_KEYWORDS = new Set([
  '$defs',
  'definitions',
  'dependencies',
  'patternProperties',
  'properties',
]);

const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'anyOf', 'oneOf']);

const SCHEMA_VALUE_KEYWORDS = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasRequiredDefault = (schema: JsonSchemaObject): boolean => {
  if (!Array.isArray(schema.required) || !isObject(schema.properties)) {
    return false;
  }

  return schema.required.some(name => {
    const property = schema.properties?.[name];
    return isObject(property) && property.default !== undefined;
  });
};

const hasUnparsedRequiredProperty = (schema: JsonSchemaObject): boolean => {
  if (!Array.isArray(schema.required)) {
    return false;
  }
  const declared = new Set(Object.keys(schema.properties ?? {}));
  return schema.required.some(name => !declared.has(name));
};

/**
 * The native parsers preserve useful Zod structure and materialize defaults,
 * but some JSON Schema assertions cannot be represented by their first-match
 * dispatch. Only those schemas receive an authoritative Draft 7 guard.
 */
export const requiresWholeSchemaValidation = (
  schema: JsonSchema,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (!isObject(schema) || seen.has(schema)) {
    return false;
  }
  seen.add(schema);

  if (
    Object.keys(schema).some(key => REQUIRES_WHOLE_SCHEMA_VALIDATION.has(key)) ||
    (schema.type === undefined &&
      Object.keys(schema).some(key => TYPELESS_TYPE_SCOPED_KEYWORDS.has(key))) ||
    hasUnparsedRequiredProperty(schema) ||
    hasRequiredDefault(schema)
  ) {
    return true;
  }

  for (const [key, child] of Object.entries(schema)) {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isObject(child)) {
      if (
        Object.values(child).some(value => requiresWholeSchemaValidation(value as JsonSchema, seen))
      ) {
        return true;
      }
    } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
      if (child.some(value => requiresWholeSchemaValidation(value as JsonSchema, seen))) {
        return true;
      }
    } else if (SCHEMA_VALUE_KEYWORDS.has(key)) {
      const values = Array.isArray(child) ? child : [child];
      if (values.some(value => requiresWholeSchemaValidation(value as JsonSchema, seen))) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Some schemas are valid for JSON instance types that the native parser does
 * not materialize. In those cases the Draft 7 validator must not pipe into a
 * narrower Zod schema after it has already accepted the source value.
 */
export const requiresPermissiveMaterialization = (
  schema: JsonSchema,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (!isObject(schema) || seen.has(schema)) {
    return false;
  }
  seen.add(schema);

  if (
    '$ref' in schema ||
    (schema.type === undefined &&
      (Object.keys(schema).some(key => TYPELESS_TYPE_SCOPED_KEYWORDS.has(key)) ||
        ['if', 'then', 'else', 'not'].some(key => key in schema)))
  ) {
    return true;
  }

  for (const [key, child] of Object.entries(schema)) {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isObject(child)) {
      if (
        Object.values(child).some(value =>
          requiresPermissiveMaterialization(value as JsonSchema, seen)
        )
      ) {
        return true;
      }
    } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
      if (child.some(value => requiresPermissiveMaterialization(value as JsonSchema, seen))) {
        return true;
      }
    } else if (SCHEMA_VALUE_KEYWORDS.has(key)) {
      const values = Array.isArray(child) ? child : [child];
      if (values.some(value => requiresPermissiveMaterialization(value as JsonSchema, seen))) {
        return true;
      }
    }
  }

  return false;
};

export const withWholeSchemaValidation = (
  jsonSchema: JsonSchema,
  parsedSchema: z.ZodTypeAny
): z.ZodTypeAny => {
  const validator = new Validator(structuredClone(jsonSchema) as InterpreterSchema, '7', false);

  // Validate the source value before defaults and other Zod transforms run.
  // Otherwise a missing required field can be synthesized and incorrectly
  // appear valid to the JSON Schema interpreter.
  const guardedSchema = z
    .any()
    .superRefine((value, ctx) => {
      let result: ReturnType<Validator['validate']>;
      try {
        result = validator.validate(value);
      } catch (cause) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `JSON Schema validation failed: ${String(cause)}`,
        });
        return;
      }

      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.errors[0]?.error ?? 'Input does not satisfy the complete JSON Schema.',
        });
      }
    })
    .pipe(parsedSchema);

  return parsedSchema.description
    ? guardedSchema.describe(parsedSchema.description)
    : guardedSchema;
};
