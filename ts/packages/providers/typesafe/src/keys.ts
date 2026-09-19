import type { TypesafeOption, TypesafeOptionValue } from './types';

/** Generated option keys. A raw label can never start with `__`, so these never collide. */
export const NOT_STATED_KEY = '__not_stated__';
export const NULL_KEY = '__null__';
export const NONE_KEY = '__none__';

/** A Choice takes at most 255 options; one is always generated. */
export const MAX_CHOICE_OPTIONS = 255;

const OBJECT_PROTOTYPE_NAMES = new Set([
  'constructor',
  'prototype',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
]);

// Numeric-looking keys reorder in JS objects and hit @typesafe-ai/sdk issue #4.
const NUMERIC_LOOKING = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NON_FINITE = new Set(['Infinity', '+Infinity', '-Infinity', 'NaN']);
const EDGE_WHITESPACE = /^[ \t\n\r]|[ \t\n\r]$/;
const INDEX_PREFIXED = /^o\d+_/;

/** Whether a label can be sent to Jev as its own option key. */
export function isSafeLabel(label: string): boolean {
  return (
    label.length > 0 &&
    !label.startsWith('__') &&
    !OBJECT_PROTOTYPE_NAMES.has(label) &&
    !NUMERIC_LOOKING.test(label) &&
    !NON_FINITE.has(label) &&
    !EDGE_WHITESPACE.test(label) &&
    !INDEX_PREFIXED.test(label)
  );
}

/** `o<index>_<label with every non-alphanumeric code point replaced by _>`, capped at 32 code points. */
export function indexPrefixedKey(label: string, index: number): string {
  let slug = '';
  let count = 0;
  for (const codePoint of label) {
    if (count === 32) break;
    slug += /^[A-Za-z0-9]$/.test(codePoint) ? codePoint : '_';
    count += 1;
  }
  return `o${index}_${slug}`;
}

export function optionKey(label: string, index: number): string {
  return isSafeLabel(label) ? label : indexPrefixedKey(label, index);
}

/** Labels for option values. Numbers are safe integers, so `String` matches Python's `str`. */
export function optionLabel(value: TypesafeOptionValue): string {
  return value === null ? 'null' : String(value);
}

/** Builds options in declared order. `values` holds no duplicates and no `null`. */
export function buildOptions(values: ReadonlyArray<string | number>): TypesafeOption[] {
  return values.map((value, index) => ({
    key:
      typeof value === 'string' ? optionKey(value, index) : indexPrefixedKey(String(value), index),
    value,
  }));
}

/** Restores typed values through a Map, never by object lookup. */
export function optionValues(
  options: ReadonlyArray<TypesafeOption>
): Map<string, TypesafeOptionValue> {
  return new Map(options.map(option => [option.key, option.value]));
}
