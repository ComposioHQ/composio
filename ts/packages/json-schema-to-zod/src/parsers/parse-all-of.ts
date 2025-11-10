import { z, z3, type ZodTypeAny } from '../zod-compat';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, JsonSchema, Refs } from '../types';
import { half } from '../utils/half';

const originalIndex = Symbol('Original index');

const ensureOriginalIndex = (arr: JsonSchema[]) => {
  const newArr = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === 'boolean') {
      newArr.push(item ? { [originalIndex]: i } : { [originalIndex]: i, not: {} });
    } else if (originalIndex in item) {
      return arr;
    } else {
      newArr.push({ ...item, [originalIndex]: i });
    }
  }

  return newArr;
};

export function parseAllOf(
  jsonSchema: JsonSchemaObject & { allOf: JsonSchema[] },
  refs: Refs
): ZodTypeAny {
  if (jsonSchema.allOf.length === 0) {
    return z.never();
  }

  if (jsonSchema.allOf.length === 1) {
    const item = jsonSchema.allOf[0];

    return parseSchema(item, {
      ...refs,
      path: [...refs.path, 'allOf', (item as never)[originalIndex]],
    });
  }

  const [left, right] = half(ensureOriginalIndex(jsonSchema.allOf));

  // Type assertion needed because parseAllOf returns ZodTypeAny (union type),
  // but z.intersection expects the specific zod version's type
  return z.intersection(
    parseAllOf({ allOf: left }, refs) as z3.ZodTypeAny,
    parseAllOf({ allOf: right }, refs) as z3.ZodTypeAny
  ) as ZodTypeAny;
}
