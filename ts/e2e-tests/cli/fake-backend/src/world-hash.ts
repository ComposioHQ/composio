/**
 * A short digest of a world's state, so two worlds can be compared without
 * diffing them: two rigs that start from the same seed hash the same, and a
 * request that changed anything changes the hash.
 */

import { createHash } from 'node:crypto';
import type { World } from './world';

/** JSON with every object's keys sorted, so equal content serialises one way. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const worldHash = (world: World): string =>
  createHash('sha256').update(canonical(world.snapshot())).digest('hex').slice(0, 16);
