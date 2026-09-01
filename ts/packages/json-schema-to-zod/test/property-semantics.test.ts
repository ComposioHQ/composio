/**
 * Property-based acceptance parity for scalar JSON Schema conversion.
 *
 * The oracle is Ajv in Draft 7 mode: for every generated scalar schema and
 * instance, the converted Zod schema must accept exactly what the oracle
 * accepts.
 *
 * The generator deliberately stays inside the semantics the converter claims
 * to support today; shrinking an exclusion is the way to turn a fixed
 * behavior into a permanent regression guard. The remaining exclusions are
 * deliberate divergences or oracle limits, not open bugs:
 *
 * - `multipleOf` is always an integer: the converter checks decimal
 *   multiples through decimal scaling (see the `primitive-float-multiple-of`
 *   corpus case) while the oracle uses raw float modulo; generated numbers
 *   also exclude the subnormal range where that scaling underflows
 * - draft-4 boolean `exclusiveMinimum`/`exclusiveMaximum` are never
 *   generated: they are not part of Draft 7, so the oracle cannot express
 *   them (the `primitive-draft4-boolean-exclusive-bounds` corpus case covers
 *   them)
 */
import Ajv from 'ajv';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { jsonSchemaToZod } from '../src/index';
import type { JsonSchema, Serializable } from '../src/types';

const SCALAR_TYPES = ['string', 'integer', 'number', 'boolean', 'null'] as const;
type ScalarType = (typeof SCALAR_TYPES)[number];

const PATTERN_POOL = ['^[a-z]+$', '^[A-Z]{2}$', '[0-9]', '^a.*z$', '^(?=.*[a-y])a'] as const;
const MIN_NORMAL_NUMBER = 2 ** -1022;

const scalarValue: fc.Arbitrary<Serializable> = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -100, max: 100 }),
  fc
    .double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
    // Ajv uses raw floating-point modulo for multipleOf. Subnormal dividends
    // underflow inside Zod's decimal scaling, so they belong to the same known
    // oracle limitation as non-integer multipleOf values.
    .filter(value => value === 0 || Math.abs(value) >= MIN_NORMAL_NUMBER),
  fc.string({
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz', '\u{1D11E}'),
    maxLength: 6,
  })
);

type SchemaRecord = Record<string, unknown>;

const scalarSchema: fc.Arbitrary<SchemaRecord> = fc
  .record(
    {
      types: fc.option(
        fc.uniqueArray(fc.constantFrom<ScalarType>(...SCALAR_TYPES), {
          minLength: 1,
          maxLength: 3,
        }),
        { nil: undefined }
      ),
      collapseSingle: fc.boolean(),
      literalKind: fc.constantFrom('none', 'enum', 'const', 'both'),
      enumValues: fc.uniqueArray(scalarValue, {
        minLength: 1,
        maxLength: 4,
        comparator: 'SameValue',
      }),
      constValue: scalarValue,
      minLength: fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }),
      maxLength: fc.option(fc.integer({ min: 0, max: 6 }), { nil: undefined }),
      pattern: fc.option(fc.constantFrom(...PATTERN_POOL), { nil: undefined }),
      minimum: fc.option(fc.integer({ min: -20, max: 20 }), { nil: undefined }),
      maximum: fc.option(fc.integer({ min: -20, max: 20 }), { nil: undefined }),
      exclusiveMinimum: fc.option(fc.integer({ min: -20, max: 20 }), { nil: undefined }),
      exclusiveMaximum: fc.option(fc.integer({ min: -20, max: 20 }), { nil: undefined }),
      multipleOf: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
    },
    { noNullPrototype: true }
  )
  .map(parts => {
    const schema: SchemaRecord = {};
    const declared: ScalarType[] = parts.types ?? [];

    if (parts.types) {
      schema.type = parts.types.length === 1 && parts.collapseSingle ? parts.types[0] : parts.types;
    }
    if (parts.literalKind === 'enum' || parts.literalKind === 'both')
      schema.enum = parts.enumValues;
    if (parts.literalKind === 'const' || parts.literalKind === 'both')
      schema.const = parts.constValue;

    // Constraints attach independently of the declared type (or its absence):
    // Draft 7 scopes every scalar keyword to matching instance types anyway.
    void declared;
    for (const key of [
      'minLength',
      'maxLength',
      'pattern',
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'multipleOf',
    ] as const) {
      if (parts[key] !== undefined) schema[key] = parts[key];
    }
    return schema;
  });

const schemaAndInstance: fc.Arbitrary<{ schema: SchemaRecord; value: Serializable }> =
  scalarSchema.chain(schema => {
    const interesting: Serializable[] = [];
    if (Array.isArray(schema.enum)) interesting.push(...(schema.enum as Serializable[]));
    if ('const' in schema) interesting.push(schema.const as Serializable);
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const) {
      const bound = schema[key];
      if (typeof bound === 'number') interesting.push(bound, bound + 1, bound - 1);
    }
    const pools = [scalarValue];
    if (interesting.length > 0) pools.push(fc.constantFrom(...interesting));
    return fc.oneof(...pools).map(value => ({ schema, value }));
  });

const ajv = new Ajv({ strict: false });

describe('scalar conversion matches the Draft 7 oracle', () => {
  it('accepts exactly what Ajv accepts, standalone and object-wrapped', () => {
    fc.assert(
      fc.property(schemaAndInstance, ({ schema, value }) => {
        const objectSchema = {
          type: 'object',
          properties: { value: schema },
          required: ['value'],
          additionalProperties: false,
        };
        const instance = { value };

        const oracleScalar = ajv.compile(schema)(value);
        const zodScalar = jsonSchemaToZod(schema as JsonSchema).safeParse(value).success;
        expect(
          zodScalar,
          `standalone schema=${JSON.stringify(schema)} value=${JSON.stringify(value)}`
        ).toBe(oracleScalar);

        const oracleObject = ajv.compile(objectSchema)(instance);
        const zodObject = jsonSchemaToZod(objectSchema as JsonSchema).safeParse(instance).success;
        expect(
          zodObject,
          `wrapped schema=${JSON.stringify(schema)} value=${JSON.stringify(value)}`
        ).toBe(oracleObject);
      }),
      { numRuns: 300 }
    );
  });
});
