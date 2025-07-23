import type { ParseIssue } from 'effect/ParseResult';

export function extractActual({ actual }: ParseIssue, cap = 50) {
  // Cap the length of the actual value to 30 characters
  let str = undefined;

  if (typeof actual === 'object') {
    str = JSON.stringify(actual);
  }

  str = String(actual);
  return str.slice(0, cap) + (str.length > cap ? '...' : '');
}
