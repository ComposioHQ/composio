import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';
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

const intersect = <S>(branches: JsonSchema[], ctx: ParseContext<S>): S => {
  if (branches.length === 1) {
    const item = branches[0];

    return parseSchema(item, {
      ...ctx,
      path: [...ctx.path, 'allOf', (item as never)[originalIndex]],
    });
  }

  const [left, right] = half(branches);
  return ctx.backend.intersection(intersect(left, ctx), intersect(right, ctx));
};

export function parseAllOf<S>(
  jsonSchema: JsonSchemaObject & { allOf: JsonSchema[] },
  ctx: ParseContext<S>
): S {
  if (jsonSchema.allOf.length === 0) {
    return ctx.backend.never();
  }

  if (jsonSchema.allOf.length === 1) {
    return intersect(ensureOriginalIndex(jsonSchema.allOf), ctx);
  }

  // Sibling object branches must not reject each other's keys: each branch is
  // materialized open, and the strictness a lone named-property object would
  // have had is re-applied once over the union of every branch's properties.
  const opened = jsonSchema.allOf.map(branch =>
    isClosedObjectBranch(branch) ? { ...branch, additionalProperties: true } : branch
  );
  const parsed = intersect(ensureOriginalIndex(opened), ctx);

  if (!jsonSchema.allOf.every(isClosedObjectBranch)) {
    return parsed;
  }

  const declaredKeys = new Set(
    jsonSchema.allOf.flatMap(branch => Object.keys((branch as JsonSchemaObject).properties ?? {}))
  );

  return ctx.backend.superRefine<unknown>(parsed, (value, issues) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    const unrecognizedKeys = Object.keys(value).filter(key => !declaredKeys.has(key));
    if (unrecognizedKeys.length > 0) {
      issues.unrecognizedKeys(
        unrecognizedKeys,
        `Unrecognized key(s) in object: ${unrecognizedKeys.map(key => `'${key}'`).join(', ')}`
      );
    }
  });
}
