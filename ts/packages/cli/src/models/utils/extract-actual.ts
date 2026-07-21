import { Option, SchemaIssue } from 'effect';
import { inspect } from 'node:util';

export function extractActual(issue: SchemaIssue.Issue, cap = 50) {
  const actual = Option.getOrUndefined(SchemaIssue.getActual(issue));

  // Cap the length of the actual value to 50 characters
  let str: string;

  if (typeof actual === 'object') {
    str = inspect(actual, { depth: 2 });
  } else {
    str = String(actual);
  }

  return str.slice(0, cap) + (str.length > cap ? '...' : '');
}
