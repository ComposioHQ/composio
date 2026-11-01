import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject } from '../types';
import { omit } from '../utils/omit';

/**
 * For compatibility with open api 3.0 nullable
 */
export const parseNullable = <S>(
  jsonSchema: JsonSchemaObject & { nullable: true },
  ctx: ParseContext<S>
): S => {
  // If the schema has a null default, we need to handle it specially
  // Remove the default from the base schema to prevent it from being applied to non-null types
  const hasNullDefault = jsonSchema.default === null;
  const baseSchema = hasNullDefault
    ? omit(omit(jsonSchema, 'nullable'), 'default')
    : omit(jsonSchema, 'nullable');

  const zodSchema = ctx.backend.nullable(parseSchema(baseSchema, ctx, true));

  // Apply the null default at the nullable level if it exists
  return hasNullDefault ? ctx.backend.withDefault(zodSchema, null) : zodSchema;
};
