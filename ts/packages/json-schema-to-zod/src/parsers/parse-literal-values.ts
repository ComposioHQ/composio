import { dequal } from 'dequal/lite';

import type { ZodBackend } from '../backend/types';
import type { Serializable } from '../types';

export const parseLiteralValues = <S>(
  values: ReadonlyArray<Serializable>,
  backend: ZodBackend<S>
): S => {
  if (values.length === 0) return backend.never();

  if (values.every(value => value === null || typeof value !== 'object')) {
    const primitives = values as ReadonlyArray<string | number | boolean | null>;
    if (primitives.length === 1) return backend.literal(primitives[0]);
    if (primitives.every(value => typeof value === 'string')) {
      return backend.enum(primitives as [string, ...string[]]);
    }
    return backend.union(primitives.map(value => backend.literal(value)) as unknown as [S, S]);
  }

  return backend.predicate(value => values.some(candidate => dequal(value, candidate)));
};
