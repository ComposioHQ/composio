import { z, z3, type ZodTypeAny } from '../zod-compat';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, JsonSchema, Refs } from '../types';

export const parseAnyOf = (jsonSchema: JsonSchemaObject & { anyOf: JsonSchema[] }, refs: Refs) => {
  return jsonSchema.anyOf.length
    ? jsonSchema.anyOf.length === 1
      ? parseSchema(jsonSchema.anyOf[0], {
          ...refs,
          path: [...refs.path, 'anyOf', 0],
        })
      : (z.union(
          jsonSchema.anyOf.map((schema, i) =>
            parseSchema(schema, { ...refs, path: [...refs.path, 'anyOf', i] })
          ) as [z3.ZodTypeAny, z3.ZodTypeAny, ...z3.ZodTypeAny[]]
        ) as ZodTypeAny)
    : z.any();
};
