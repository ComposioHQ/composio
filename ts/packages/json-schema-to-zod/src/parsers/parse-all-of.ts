import { z } from 'zod/v3';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, JsonSchema, Refs } from '../types';
import { half } from '../utils/half';
import { its } from '../utils/its';

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

const isClosedObjectBranch = (
  branch: JsonSchema
): branch is JsonSchemaObject & { properties: Record<string, JsonSchema> } =>
  typeof branch === 'object' &&
  its.an.object(branch) &&
  branch.properties !== undefined &&
  Object.keys(branch.properties).length > 0 &&
  branch.additionalProperties === undefined &&
  branch.patternProperties === undefined &&
  !('$ref' in branch);

const intersect = (branches: JsonSchema[], refs: Refs): z.ZodTypeAny => {
  if (branches.length === 1) {
    const item = branches[0];

    return parseSchema(item, {
      ...refs,
      path: [...refs.path, 'allOf', (item as never)[originalIndex]],
    });
  }

  const [left, right] = half(branches);
  return z.intersection(intersect(left, refs), intersect(right, refs));
};

export function parseAllOf(
  jsonSchema: JsonSchemaObject & { allOf: JsonSchema[] },
  refs: Refs
): z.ZodTypeAny {
  if (jsonSchema.allOf.length === 0) {
    return z.never();
  }

  if (jsonSchema.allOf.length === 1) {
    return intersect(ensureOriginalIndex(jsonSchema.allOf), refs);
  }

  // Sibling object branches must not reject each other's keys: each branch is
  // materialized open, and the strictness a lone named-property object would
  // have had is re-applied once over the union of every branch's properties.
  const opened = jsonSchema.allOf.map(branch =>
    isClosedObjectBranch(branch) ? { ...branch, additionalProperties: true } : branch
  );
  const parsed = intersect(ensureOriginalIndex(opened), refs);

  if (!jsonSchema.allOf.every(isClosedObjectBranch)) {
    return parsed;
  }

  const declaredKeys = new Set(
    jsonSchema.allOf.flatMap(branch => Object.keys((branch as JsonSchemaObject).properties ?? {}))
  );

  return parsed.superRefine((value, ctx) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    const unrecognizedKeys = Object.keys(value).filter(key => !declaredKeys.has(key));
    if (unrecognizedKeys.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.unrecognized_keys,
        keys: unrecognizedKeys,
        message: `Unrecognized key(s) in object: ${unrecognizedKeys.map(key => `'${key}'`).join(', ')}`,
      });
    }
  });
}
