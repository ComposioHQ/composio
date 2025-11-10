import { z, z3, type ZodTypeAny } from '../zod-compat';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, JsonSchema, Refs } from '../types';

export const parseIfThenElse = (
  jsonSchema: JsonSchemaObject & {
    if: JsonSchema;
    then: JsonSchema;
    else: JsonSchema;
  },
  refs: Refs
) => {
  const $if = parseSchema(jsonSchema.if, { ...refs, path: [...refs.path, 'if'] });
  const $then = parseSchema(jsonSchema.then, {
    ...refs,
    path: [...refs.path, 'then'],
  });
  const $else = parseSchema(jsonSchema.else, {
    ...refs,
    path: [...refs.path, 'else'],
  });

  return z
    .union([$then, $else] as [z3.ZodTypeAny, z3.ZodTypeAny, ...z3.ZodTypeAny[]])
    .superRefine((value, ctx) => {
      const result = ($if as z3.ZodTypeAny).safeParse(value).success
        ? ($then as z3.ZodTypeAny).safeParse(value)
        : ($else as z3.ZodTypeAny).safeParse(value);

      if (!result.success) {
        result.error.errors.forEach((error: z3.ZodIssue) => ctx.addIssue(error as z3.ZodIssue));
      }
    }) as ZodTypeAny;
};
