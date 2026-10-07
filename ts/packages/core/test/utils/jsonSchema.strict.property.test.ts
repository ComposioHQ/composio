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
 * Reference cycles are never generated: a cycle that consumes no input makes
 * the oracle recurse forever. The `null acceptance` suite in
 * `jsonSchema.strict.test.ts` covers them by example.
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
};
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

const usesOneOf = (node: unknown): boolean => {
  if (Array.isArray(node)) return node.some(usesOneOf);
  if (typeof node !== 'object' || node === null) return false;
  return 'oneOf' in node || Object.values(node).some(usesOneOf);
};

const ajv = new Ajv2020({ strict: false });
const validatorFor = (schema: SchemaRecord) => ajv.compile(schema);
const RUNS = 300;
const TIMEOUT_MS = 30_000;

describe('strict-mode null semantics', () => {
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

        for (const sample of SAMPLES) {
          const args = { value: sample };
          if (original(args)) expect(strict(args)).toBe(true);
          else if (!usesOneOf(property)) expect(strict(args)).toBe(false);
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
