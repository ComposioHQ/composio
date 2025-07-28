import type { ParseIssue } from 'effect/ParseResult';
import { inspect } from 'node:util';

export function extractActual({ actual }: ParseIssue, cap = 50) {
  // Cap the length of the actual value to 50 characters
  let str: string;

  if (typeof actual === 'object') {
    str = inspect(actual, { depth: 2 });
  } else {
    str = String(actual);
  }

  return str.slice(0, cap) + (str.length > cap ? '...' : '');
}
