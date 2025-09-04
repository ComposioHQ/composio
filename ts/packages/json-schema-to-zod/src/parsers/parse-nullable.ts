import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs } from '../types';
import { omit } from '../utils/omit';

/**
 * For compatibility with open api 3.0 nullable
 */
export const parseNullable = (jsonSchema: JsonSchemaObject & { nullable: true }, refs: Refs) => {
  // If the schema has a null default, we need to handle it specially
  // Remove the default from the base schema to prevent it from being applied to non-null types
  const hasNullDefault = jsonSchema.default === null;
  const baseSchema = hasNullDefault
    ? omit(omit(jsonSchema, 'nullable'), 'default')
    : omit(jsonSchema, 'nullable');

  const zodSchema = parseSchema(baseSchema, refs, true).nullable();

  // Apply the null default at the nullable level if it exists
  return hasNullDefault ? zodSchema.default(null) : zodSchema;
};
