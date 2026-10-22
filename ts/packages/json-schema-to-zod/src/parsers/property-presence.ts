import type { ZodBackend } from '../backend/types';
import type { JsonSchema, JsonSchemaObject } from '../types';

const admitsNull = (branches: JsonSchema[] | undefined): boolean =>
  Array.isArray(branches) &&
  branches.some(
    (schema: JsonSchema) => typeof schema === 'object' && schema !== null && schema.type === 'null'
  );

/**
 * Wraps a parsed property for its place in an object: required properties
 * stay as parsed, optional ones become optional, and an optional property
 * with a `default` carries it. A `null` default makes the property nullable
 * unless its schema already admits `null` through `anyOf`, `oneOf`, or
 * `nullable`.
 */
export const applyPropertyPresence = <S>(
  backend: ZodBackend<S>,
  propJsonSchema: JsonSchema,
  parsed: S,
  required: boolean
): S => {
  if (
    !required &&
    propJsonSchema &&
    typeof propJsonSchema === 'object' &&
    'default' in propJsonSchema
  ) {
    if (propJsonSchema.default === null) {
      const isNullable =
        'nullable' in propJsonSchema &&
        (propJsonSchema as JsonSchemaObject & { nullable?: boolean }).nullable === true;

      if (admitsNull(propJsonSchema.anyOf) || admitsNull(propJsonSchema.oneOf) || isNullable) {
        return backend.withDefault(backend.optional(parsed), null);
      }
      return backend.withDefault(backend.optional(backend.nullable(parsed)), null);
    }
    return backend.withDefault(backend.optional(parsed), propJsonSchema.default);
  }

  return required ? parsed : backend.optional(parsed);
};
