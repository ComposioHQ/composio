import { parseLiteralValues } from './parse-literal-values';
import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, Serializable } from '../types';

export const parseEnum = (jsonSchema: JsonSchemaObject & { enum: Serializable[] }, refs: Refs) => {
  const { enum: values, ...baseSchema } = jsonSchema;
  return parseSchema(baseSchema, { ...refs, seen: new Map(refs.seen) }, true).and(
    parseLiteralValues(values)
  );
};
