import { z, z3, type ZodTypeAny } from '../zod-compat';

import type { JsonSchemaObject, Serializable } from '../types';

export const parseEnum = (jsonSchema: JsonSchemaObject & { enum: Serializable[] }) => {
  if (jsonSchema.enum.length === 0) {
    return z.never();
  }

  if (jsonSchema.enum.length === 1) {
    // union does not work when there is only one element
    return z.literal(jsonSchema.enum[0] as z3.Primitive);
  }

  if (jsonSchema.enum.every(x => typeof x === 'string')) {
    return z.enum(jsonSchema.enum as [string]);
  }

  return z.union(
    jsonSchema.enum.map(x => z.literal(x as z3.Primitive)) as unknown as [
      z3.ZodTypeAny,
      z3.ZodTypeAny,
      ...z3.ZodTypeAny[],
    ]
  ) as ZodTypeAny;
};
