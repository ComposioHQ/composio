import { describe, it, expect } from 'vitest';
import { omitNullToolArguments, toStrictJsonSchema } from '../../src/utils/jsonSchema';
import { loadStrictCases } from '../fixtures/json-schema-conversion/corpus';

/** Structural invariants OpenAI enforces on every node of a strict schema. */
function assertStrictShape(node: unknown, path = ''): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => assertStrictShape(item, `${path}[${index}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.anyOf !== undefined) {
    expect(record.type, `${path}: type beside anyOf`).toBeUndefined();
  }
  for (const keyword of [
    'default',
    'examples',
    'oneOf',
    'patternProperties',
    'allOf',
    'prefixItems',
  ]) {
    expect(record[keyword], `${path}: ${keyword}`).toBeUndefined();
  }
  const isObject =
    record.type === 'object' || (Array.isArray(record.type) && record.type.includes('object'));
  if (isObject || record.properties !== undefined) {
    const properties = (record.properties ?? {}) as Record<string, unknown>;
    expect(record.required, `${path}: required`).toEqual(Object.keys(properties));
    expect(record.additionalProperties, `${path}: additionalProperties`).toBe(false);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'enum' || key === 'const') continue;
    const childPath = path ? `${path}.${key}` : key;
    if (
      (key === 'properties' || key === '$defs' || key === 'definitions') &&
      child &&
      typeof child === 'object'
    ) {
      // Keys of these maps are names, not keywords.
      for (const [name, sub] of Object.entries(child as Record<string, unknown>)) {
        assertStrictShape(sub, `${childPath}.${name}`);
      }
      continue;
    }
    assertStrictShape(child, childPath);
  }
}

describe('toStrictJsonSchema (shared corpus)', () => {
  for (const testCase of loadStrictCases()) {
    it(testCase.id, () => {
      const snapshot = JSON.parse(JSON.stringify(testCase.schema));
      const result = toStrictJsonSchema(testCase.schema);

      expect(testCase.schema, 'input mutated').toEqual(snapshot);
      if ('unsupported' in testCase.strict) {
        expect(result.unsupported.map(({ path, keyword }) => ({ path, keyword }))).toEqual(
          testCase.strict.unsupported
        );
      } else {
        expect(result.unsupported).toEqual([]);
        expect(result.schema).toEqual(testCase.strict.schema);
        assertStrictShape(result.schema);
        const again = toStrictJsonSchema(result.schema);
        expect(again.schema, 'not idempotent').toEqual(result.schema);
        expect(again.changes).toEqual([]);
      }
      expect(result.changes.map(({ path, reason }) => ({ path, reason }))).toEqual(
        testCase.changes ?? []
      );
      expect(result.totalChanges).toBe(result.changes.length);
      for (const { input, output } of testCase.arguments ?? []) {
        expect(omitNullToolArguments(input, result.source)).toEqual(output);
      }
    });
  }
});
