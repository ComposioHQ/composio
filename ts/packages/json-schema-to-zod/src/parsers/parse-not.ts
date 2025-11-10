import { z, z3, type ZodTypeAny } from '../zod-compat';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, JsonSchema, Refs } from '../types';

export const parseNot = (
  jsonSchema: JsonSchemaObject & { not: JsonSchema },
  refs: Refs
): ZodTypeAny => {
  return z.any().refine(
    value =>
      !(
        parseSchema(jsonSchema.not, {
          ...refs,
          path: [...refs.path, 'not'],
        }) as z3.ZodTypeAny
      ).safeParse(value).success,
    'Invalid input: Should NOT be valid against schema'
  ) as ZodTypeAny;
};
