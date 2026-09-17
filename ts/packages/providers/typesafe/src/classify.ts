import type { JSONSchemaProperty } from '@composio/core';
import { MAX_CHOICE_OPTIONS } from './keys';

export type ArgumentClass =
  | { kind: 'enum'; values: Array<string | number>; nullable: boolean }
  | { kind: 'boolean' }
  | { kind: 'enum_array'; values: Array<string | number>; maxItems?: number }
  | { kind: 'open' };

const OPEN: ArgumentClass = { kind: 'open' };

const typesOf = (property: JSONSchemaProperty): string[] =>
  property.type === undefined ? [] : Array.isArray(property.type) ? property.type : [property.type];

/**
 * Collects the literal members a property allows, or `undefined` when any branch is free-form.
 * `anyOf`/`oneOf` branches must each be a `const`, an `enum`, or `{ type: 'null' }`.
 */
function literalMembers(property: JSONSchemaProperty): unknown[] | undefined {
  if (property.enum !== undefined) return property.enum;
  if (property.const !== undefined) return [property.const];
  const branches = property.anyOf ?? property.oneOf;
  if (branches === undefined || branches.length === 0) return undefined;
  const members: unknown[] = [];
  for (const branch of branches) {
    const types = typesOf(branch);
    if (types.length === 1 && types[0] === 'null' && branch.enum === undefined) {
      members.push(null);
      continue;
    }
    if (branch.enum === undefined && branch.const === undefined) return undefined;
    const nested = literalMembers(branch);
    if (nested === undefined) return undefined;
    members.push(...nested);
  }
  return members;
}

function classifyMembers(members: unknown[], nullableHint: boolean): ArgumentClass {
  const nullable = nullableHint || members.includes(null);
  const values = [...new Set(members.filter(member => member !== null))];
  if (values.length === 0) return OPEN;
  if (values.every(value => typeof value === 'boolean')) {
    // The boolean Choice offers both yes and no, so a set that allows one of them stays open.
    return values.length === 2 ? { kind: 'boolean' } : OPEN;
  }
  const strings = values.filter((value): value is string => typeof value === 'string');
  const integers = values.filter(
    (value): value is number => typeof value === 'number' && Number.isSafeInteger(value)
  );
  // Mixed-type enums are open-ended: `1` and `"1"` cannot both be told apart by Jev.
  const homogeneous = strings.length === values.length ? strings : integers;
  if (homogeneous.length !== values.length) return OPEN;
  // One slot is taken by "not stated", and one more by `null` when nullable.
  if (homogeneous.length + (nullable ? 2 : 1) > MAX_CHOICE_OPTIONS) return OPEN;
  return { kind: 'enum', values: homogeneous, nullable };
}

/** Classifies one dereferenced property. Anything that is not a closed set is open-ended. */
export function classifyProperty(property: JSONSchemaProperty): ArgumentClass {
  const types = typesOf(property);
  const nullableHint = property.nullable === true || types.includes('null');
  const valueTypes = types.filter(type => type !== 'null');

  if (valueTypes.includes('object')) return OPEN;

  if (valueTypes.includes('array')) {
    if (valueTypes.length !== 1 || property.items === undefined || Array.isArray(property.items)) {
      return OPEN;
    }
    const items = classifyProperty(property.items);
    if (items.kind !== 'enum' || items.nullable) return OPEN;
    return {
      kind: 'enum_array',
      values: items.values,
      ...(property.maxItems === undefined ? {} : { maxItems: property.maxItems }),
    };
  }

  const members = literalMembers(property);
  if (members !== undefined) return classifyMembers(members, nullableHint);
  if (valueTypes.length === 1 && valueTypes[0] === 'boolean') return { kind: 'boolean' };
  return OPEN;
}
