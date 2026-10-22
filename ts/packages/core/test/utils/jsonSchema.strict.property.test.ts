/**
 * Property-based null semantics for strict mode.
 *
 * The oracle is Ajv in Draft 2020-12 mode. Strict mode makes every optional
 * parameter required and uses `null` to mean "omitted", so for every generated
 * optional property:
 *
 * - the strict schema accepts `null`
 * - the arguments left after `omitNullToolArguments` validate against the
 *   tool's own schema, and a `null` that schema accepts is kept
 * - the strict schema accepts every non-null value the tool's schema accepts,
 *   and nothing more unless a `oneOf` was converted to `anyOf`
 * - the rewrite is idempotent
 *
 * The Python counterpart is `python/tests/test_strict_schema_properties.py`;
 * keep the generators and invariants aligned.
 *
 * Those generators never produce reference cycles: a cycle that consumes no
 * input makes the oracle recurse forever. Cycles are checked separately against
 * the least fixed point of the definitions, computed by plain iteration: a null
 * is accepted only when a finite chain of branches proves it.
 */
import Ajv2020 from 'ajv/dist/2020';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { omitNullToolArguments, toStrictJsonSchema } from '../../src/utils/jsonSchema';

type SchemaRecord = Record<string, unknown>;

const TYPES = ['string', 'integer', 'boolean', 'null'] as const;
const LITERALS = ['asc', 'desc', 1, true, null] as const;
const SAMPLES = ['asc', 'desc', 'other', 1, 2, true, false] as const;
const DEFINITIONS: SchemaRecord = {
  Direction: { type: 'string', enum: ['asc', 'desc'] },
  NullableDirection: { enum: ['asc', null] },
  Text: { type: 'string' },
  NullableText: { type: ['string', 'null'] },
  Config: { properties: { url: { type: 'string' } } },
};
// The rewrite types this definition as an object, so the strict schema rejects
// the non-object values the tool's schema lets through.
const TYPELESS_OBJECT_REF = '#/$defs/Config';
// Compositions strict mode supports, and the ones only the tool's schema uses.
const STRICT_COMPOSITIONS = ['anyOf', 'oneOf'] as const;
const ALL_COMPOSITIONS = [...STRICT_COMPOSITIONS, 'allOf', 'not', 'if'] as const;
type Composition = (typeof ALL_COMPOSITIONS)[number];

const leafKeywords: fc.Arbitrary<SchemaRecord> = fc
  .record({
    type: fc.oneof(
      fc.constant(undefined),
      fc.constantFrom(...TYPES),
      fc.uniqueArray(fc.constantFrom(...TYPES), { minLength: 1, maxLength: 3 })
    ),
    literal: fc.oneof(
      { arbitrary: fc.constant<SchemaRecord>({}), weight: 2 },
      fc
        .uniqueArray(fc.constantFrom(...LITERALS), { minLength: 1, maxLength: 3 })
        .map(values => ({ enum: values })),
      fc.constantFrom(...LITERALS).map(value => ({ const: value }))
    ),
    ref: fc.oneof(
      { arbitrary: fc.constant(undefined), weight: 3 },
      fc.constantFrom(...Object.keys(DEFINITIONS)).map(name => `#/$defs/${name}`)
    ),
    described: fc.boolean(),
  })
  .map(({ type, literal, ref, described }) => ({
    ...(type === undefined ? {} : { type }),
    ...literal,
    ...(ref === undefined ? {} : { $ref: ref }),
    ...(described ? { description: 'a parameter' } : {}),
  }));

function propertySchema(
  compositions: readonly Composition[],
  depth = 0
): fc.Arbitrary<SchemaRecord> {
  if (depth >= 2) return leafKeywords;
  const nested = propertySchema(compositions, depth + 1);
  const branches = fc.array(nested, { minLength: 1, maxLength: 3 });
  const composition: Record<Composition, fc.Arbitrary<SchemaRecord>> = {
    anyOf: branches.map(anyOf => ({ anyOf })),
    oneOf: branches.map(oneOf => ({ oneOf })),
    allOf: branches.map(allOf => ({ allOf })),
    not: nested.map(not => ({ not })),
    if: fc
      .record({ if: nested, then: fc.option(nested), else: fc.option(nested) })
      .map(({ if: condition, then, else: otherwise }) => ({
        if: condition,
        ...(then === null ? {} : { then }),
        ...(otherwise === null ? {} : { else: otherwise }),
      })),
  };
  return fc
    .tuple(
      leafKeywords,
      fc.oneof(
        { arbitrary: fc.constant<SchemaRecord>({}), weight: 2 },
        ...compositions.map(keyword => composition[keyword])
      )
    )
    .map(([leaf, composed]) => ({ ...leaf, ...composed }));
}

const toolSchema = (property: SchemaRecord): SchemaRecord => ({
  type: 'object',
  properties: { value: property },
  $defs: structuredClone(DEFINITIONS),
});

/** Whether any node carries `keyword` (with `value`, when given). */
const mentions = (node: unknown, keyword: string, value?: unknown): boolean => {
  if (Array.isArray(node)) return node.some(item => mentions(item, keyword, value));
  if (typeof node !== 'object' || node === null) return false;
  const record = node as SchemaRecord;
  if (keyword in record && (value === undefined || record[keyword] === value)) return true;
  return Object.values(record).some(child => mentions(child, keyword, value));
};

const ajv = new Ajv2020({ strict: false });
const validatorFor = (schema: SchemaRecord) => ajv.compile(schema);
const RUNS = 300;
const TIMEOUT_MS = 30_000;

const LEAVES: readonly SchemaRecord[] = [{ type: 'null' }, { type: 'string' }, {}];
const leaf = fc.constantFrom(...LEAVES).map(schema => ({ ...schema }));

/** Definitions that reference each other freely, cycles included. */
const referenceGraph: fc.Arbitrary<Record<string, SchemaRecord>> = fc
  .integer({ min: 1, max: 7 })
  .chain(count => {
    const names = Array.from({ length: count }, (_, index) => `d${index}`);
    const reference = fc.constantFrom(...names).map(name => ({ $ref: `#/$defs/${name}` }));
    const composed = fc
      .record({
        keyword: fc.constantFrom('anyOf', 'allOf'),
        references: fc.array(reference, { minLength: 1, maxLength: 3 }),
        extra: fc.option(leaf),
      })
      .map(({ keyword, references, extra }) => ({
        [keyword]: extra === null ? references : [...references, extra],
      }));
    const definition = fc.oneof({ arbitrary: leaf, weight: 1 }, { arbitrary: composed, weight: 4 });
    return fc
      .tuple(...names.map(() => definition))
      .map(definitions =>
        Object.fromEntries(names.map((name, index) => [name, definitions[index]]))
      );
  });

function leastFixedPoint(definitions: Record<string, SchemaRecord>): Record<string, boolean> {
  const accepted: Record<string, boolean> = Object.fromEntries(
    Object.keys(definitions).map(name => [name, false])
  );
  const holds = (node: SchemaRecord): boolean => {
    if (typeof node.$ref === 'string') return accepted[node.$ref.slice('#/$defs/'.length)];
    if (Array.isArray(node.anyOf)) return node.anyOf.some(holds);
    if (Array.isArray(node.allOf)) return node.allOf.every(holds);
    return node.type !== 'string';
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, definition] of Object.entries(definitions)) {
      if (!accepted[name] && holds(definition)) accepted[name] = changed = true;
    }
  }
  return accepted;
}

describe('strict-mode null semantics', () => {
  it('cyclic references resolve to the least fixed point', { timeout: TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(referenceGraph, definitions => {
        const names = Object.keys(definitions);
        const reference = (name: string) => ({ $ref: `#/$defs/${name}` });
        const source = {
          type: 'object',
          properties: Object.fromEntries(names.map(name => [name, reference(name)])),
          $defs: definitions,
        };
        const expected = leastFixedPoint(definitions);
        const input = Object.fromEntries(names.map(name => [name, null]));
        expect(omitNullToolArguments(input, source)).toEqual(
          Object.fromEntries(names.filter(name => expected[name]).map(name => [name, null]))
        );

        // `allOf` makes the tool unsupported, but its properties are still widened.
        const properties = toStrictJsonSchema(source).schema.properties as SchemaRecord;
        for (const name of names) {
          expect(properties[name]).toEqual(
            expected[name] ? reference(name) : { anyOf: [reference(name), { type: 'null' }] }
          );
        }
      }),
      { numRuns: RUNS }
    );
  });

  it('null stands for omission without changing other values', { timeout: TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(propertySchema(STRICT_COMPOSITIONS), property => {
        const source = toolSchema(property);
        const snapshot = structuredClone(source);
        const result = toStrictJsonSchema(source);
        expect(source).toEqual(snapshot);
        fc.pre(result.unsupported.length === 0);

        const original = validatorFor(source);
        const strict = validatorFor(result.schema);

        expect(strict({ value: null })).toBe(true);
        const sent = omitNullToolArguments({ value: null }, result.source);
        expect(original(sent)).toBe(true);
        expect(sent).toEqual(original({ value: null }) ? { value: null } : {});

        if (!mentions(property, '$ref', TYPELESS_OBJECT_REF)) {
          for (const sample of SAMPLES) {
            const args = { value: sample };
            if (original(args)) expect(strict(args)).toBe(true);
            else if (!mentions(property, 'oneOf')) expect(strict(args)).toBe(false);
          }
        }

        const again = toStrictJsonSchema(result.schema);
        expect(again.schema).toEqual(result.schema);
        expect(again.changes).toEqual([]);
      }),
      { numRuns: RUNS }
    );
  });

  it('null is kept exactly when the tool schema accepts it', { timeout: TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(propertySchema(ALL_COMPOSITIONS), property => {
        const source = toolSchema(property);
        const accepted = validatorFor(source)({ value: null });
        expect(omitNullToolArguments({ value: null }, source)).toEqual(
          accepted ? { value: null } : {}
        );
      }),
      { numRuns: RUNS }
    );
  });
});
