import { parseLiteralValues } from './parse-literal-values';
import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, Serializable } from '../types';

export const parseConst = (jsonSchema: JsonSchemaObject & { const: Serializable }, refs: Refs) => {
  const { const: value, ...baseSchema } = jsonSchema;
  return parseSchema(baseSchema, { ...refs, seen: new Map(refs.seen) }, true).and(
    parseLiteralValues([value])
  );
};
