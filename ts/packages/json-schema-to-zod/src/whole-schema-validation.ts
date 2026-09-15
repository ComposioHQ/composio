import { encodePointer, Validator } from '@cfworker/json-schema';
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
 * not materialize. Such a node is parsed as `z.any()` so the Draft 7 guard
 * that every one of these keywords also activates (see
 * `requiresWholeSchemaValidation`) stays the acceptance authority without
 * piping into a narrower Zod schema. The check is deliberately local: a
 * permissive descendant must not widen its enclosing parser, or sibling
 * defaults would stop materializing.
 */
export const requiresPermissiveMaterialization = (schema: JsonSchema): boolean =>
  isObject(schema) &&
  ('$ref' in schema ||
    (schema.type === undefined &&
      (Object.keys(schema).some(key => TYPELESS_TYPE_SCOPED_KEYWORDS.has(key)) ||
        ['if', 'then', 'else', 'not'].some(key => key in schema))));

/**
 * The guard schema for a node nested at `path` inside `root`: the enclosing
 * document pointed at that node, so local `$ref`s resolve exactly as they do
 * for the document root. Draft 7 ignores the keywords next to `$ref`, which
 * is what lets the root's own assertions be reused as the pointer carrier.
 */
export const guardSchemaAt = (
  node: JsonSchema,
  refs: { root?: JsonSchema; path: ReadonlyArray<string | number> }
): JsonSchema =>
  isObject(refs.root) && refs.path.length > 0
    ? // `encodePointer` is the interpreter's own key encoding, so the pointer
      // lands on exactly the lookup entry `dereference` registered.
      { ...refs.root, $ref: `#/${refs.path.map(part => encodePointer(String(part))).join('/')}` }
    : node;

/**
 * OpenAPI 3.0 / Draft 4 spell exclusive bounds as a boolean flag next to
 * `minimum`/`maximum`. The Draft 7 interpreter ignores the flag, so the guard
 * receives the numeric spelling the native number parser already honors.
 */
const normalizeExclusiveBounds = (value: unknown, seen: WeakSet<object>): void => {
  if (!isObject(value) || seen.has(value)) {
    return;
  }
  seen.add(value);

  if (value.exclusiveMinimum === true && typeof value.minimum === 'number') {
    value.exclusiveMinimum = value.minimum;
    delete value.minimum;
  } else if (typeof value.exclusiveMinimum === 'boolean') {
    delete value.exclusiveMinimum;
  }
  if (value.exclusiveMaximum === true && typeof value.maximum === 'number') {
    value.exclusiveMaximum = value.maximum;
    delete value.maximum;
  } else if (typeof value.exclusiveMaximum === 'boolean') {
    delete value.exclusiveMaximum;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isObject(child)) {
      Object.values(child).forEach(nested => normalizeExclusiveBounds(nested, seen));
    } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
      child.forEach(nested => normalizeExclusiveBounds(nested, seen));
    } else if (SCHEMA_VALUE_KEYWORDS.has(key)) {
      (Array.isArray(child) ? child : [child]).forEach(nested =>
        normalizeExclusiveBounds(nested, seen)
      );
    }
  }
};

export const withWholeSchemaValidation = (
  jsonSchema: JsonSchema,
  parsedSchema: z.ZodTypeAny
): z.ZodTypeAny => {
  const interpreterSchema = structuredClone(jsonSchema);
  normalizeExclusiveBounds(interpreterSchema, new WeakSet());
  const validator = new Validator(interpreterSchema as InterpreterSchema, '7', false);

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
