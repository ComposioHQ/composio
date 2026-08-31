import { z } from 'zod/v3';

import type { Serializable } from '../types';

const jsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }

  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    return (
      leftKeys.length === Object.keys(rightRecord).length &&
      leftKeys.every(
        key => Object.hasOwn(rightRecord, key) && jsonValuesEqual(leftRecord[key], rightRecord[key])
      )
    );
  }

  return false;
};

export const parseLiteralValues = (values: ReadonlyArray<Serializable>): z.ZodTypeAny => {
  if (values.length === 0) return z.never();

  if (values.every(value => value === null || typeof value !== 'object')) {
    if (values.length === 1) return z.literal(values[0] as z.Primitive);
    if (values.every(value => typeof value === 'string')) return z.enum(values as [string]);
    return z.union(
      values.map(value => z.literal(value as z.Primitive)) as unknown as [
        z.ZodTypeAny,
        z.ZodTypeAny,
      ]
    );
  }

  return z.custom<Serializable>(value =>
    values.some(candidate => jsonValuesEqual(value, candidate))
  );
};
