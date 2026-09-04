import { dequal } from 'dequal/lite';
import { z } from 'zod/v3';

import type { Serializable } from '../types';

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

  return z.custom<Serializable>(value => values.some(candidate => dequal(value, candidate)));
};
