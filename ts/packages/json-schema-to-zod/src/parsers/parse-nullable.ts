import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs } from '../types';
import { z3, type ZodTypeAny } from '../zod-compat';
import { omit } from '../utils/omit';

/**
 * For compatibility with open api 3.0 nullable
 */
export const parseNullable = (
  jsonSchema: JsonSchemaObject & { nullable: true },
  refs: Refs
): ZodTypeAny => {
  // If the schema has a null default, we need to handle it specially
  // Remove the default from the base schema to prevent it from being applied to non-null types
  const hasNullDefault = jsonSchema.default === null;
  const baseSchema = hasNullDefault
    ? omit(omit(jsonSchema, 'nullable'), 'default')
    : omit(jsonSchema, 'nullable');

  const zodSchema = (parseSchema(baseSchema, refs, true) as z3.ZodTypeAny).nullable() as ZodTypeAny;

  // Apply the null default at the nullable level if it exists
  return hasNullDefault ? ((zodSchema as z3.ZodTypeAny).default(null) as ZodTypeAny) : zodSchema;
};
