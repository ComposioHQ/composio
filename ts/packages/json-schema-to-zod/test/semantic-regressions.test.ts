import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { z } from 'zod/v3';

import { jsonSchemaToZod, jsonSchemaToZodShape } from '../src/index';
import type { JsonSchema } from '../src/types';

type RejectionCase = {
  readonly name: string;
  readonly schema: JsonSchema;
  readonly value: unknown;
};

type AcceptanceCase = RejectionCase;

const ajv = new Ajv({ strict: false });

const rejectionCases: ReadonlyArray<RejectionCase> = [
  {
    name: 'typeless scalar dispatch must not discard object assertions',
    schema: { minLength: 2, required: ['x'] },
    value: {},
  },
  {
    name: 'anyOf must compose with adjacent assertions',
    schema: {
      type: 'string',
      minLength: 2,
      anyOf: [{ const: 'a' }, { const: 'abc' }],
    },
    value: 'a',
  },
  {
    name: 'allOf must compose with adjacent assertions',
    schema: {
      type: 'string',
      maxLength: 1,
      allOf: [{ pattern: '^ab' }],
    },
    value: 'ab',
  },
  {
    name: 'oneOf must compose with adjacent assertions',
    schema: {
      type: 'number',
      minimum: 10,
      oneOf: [{ maximum: 5 }, { minimum: 0 }],
    },
    value: 7,
  },
  {
    name: 'not must compose with adjacent assertions',
    schema: { type: 'string', minLength: 2, not: { const: 'x' } },
    value: 'a',
  },
  {
    name: 'if and then are a complete conditional without else',
    schema: { if: { type: 'string' }, then: { minLength: 2 } },
    value: 'a',
  },
  {
    name: 'conditionals must compose with adjacent primitive assertions',
    schema: {
      type: 'number',
      if: { minimum: 0 },
      then: { maximum: 10 },
      else: { minimum: -10 },
    },
    value: 20,
  },
  {
    name: 'contains must be enforced for typed arrays',
    schema: { type: 'array', contains: { const: 1 } },
    value: [2],
  },
  {
    name: 'uniqueItems must be enforced for typed arrays',
    schema: { type: 'array', uniqueItems: true },
    value: [1, 1],
  },
  {
    name: 'propertyNames must be enforced for typed objects',
    schema: { type: 'object', propertyNames: { pattern: '^x' } },
    value: { bad: 1 },
  },
  {
    name: 'required must be enforced for property-less typed objects',
    schema: { type: 'object', required: ['x'] },
    value: {},
  },
  {
    name: 'required properties must be checked before defaults materialize',
    schema: {
      type: 'object',
      properties: { x: { type: 'string', default: 'generated' } },
      required: ['x'],
    },
    value: {},
  },
  {
    name: 'const must be enforced for typed objects',
    schema: { type: 'object', const: { x: 1 } },
    value: { x: 2 },
  },
  {
    name: 'enum must be enforced for typed arrays',
    schema: { type: 'array', enum: [[1, 2]] },
    value: [2],
  },
  {
    name: 'local references must constrain direct converter callers',
    schema: {
      $defs: { positive: { type: 'number', minimum: 1 } },
      $ref: '#/$defs/positive',
    },
    value: 0,
  },
];

const acceptanceCases: ReadonlyArray<AcceptanceCase> = [
  {
    name: 'typeless properties must accept non-object instances',
    schema: { properties: { x: { type: 'string' } } },
    value: 42,
  },
  {
    name: 'typeless required must accept non-object instances',
    schema: { required: ['x'] },
    value: 42,
  },
  {
    name: 'typeless items must accept non-array instances',
    schema: { items: { type: 'string' } },
    value: 42,
  },
  {
    name: 'typeless array bounds must accept non-array instances',
    schema: { minItems: 2 },
    value: { not: 'an array' },
  },
  {
    name: 'typeless propertyNames must accept non-object instances',
    schema: { propertyNames: { pattern: '^x' } },
    value: 42,
  },
  {
    name: 'typeless dependencies must accept non-object instances',
    schema: { dependencies: { a: ['b'] } },
    value: 42,
  },
  {
    name: 'typeless not can accept a different instance type',
    schema: { not: { type: 'string' } },
    value: 42,
  },
  {
    name: 'typeless conditionals leave nonmatching instance types untouched',
    schema: { if: { type: 'string' }, then: { minLength: 2 } },
    value: 42,
  },
  {
    name: 'a direct local ref accepts values admitted by its target',
    schema: {
      $defs: { positive: { type: 'number', minimum: 1 } },
      $ref: '#/$defs/positive',
    },
    value: 2,
  },
  {
    name: 'const accepts the matching typed object',
    schema: { type: 'object', const: { x: 1 } },
    value: { x: 1 },
  },
  {
    name: 'sibling allOf object branches accept each other declared keys',
    schema: {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'string' } }, required: ['b'] },
      ],
    },
    value: { a: 'ready', b: 'set' },
  },
  {
    name: 'nested typeless object assertions accept non-object property values',
    schema: {
      type: 'object',
      properties: { value: { properties: { x: { type: 'string' } } } },
      required: ['value'],
    },
    value: { value: 42 },
  },
];

describe('whole-schema semantic regressions', () => {
  it.each(rejectionCases)('$name', ({ schema, value }) => {
    expect(ajv.compile(schema)(value), 'Draft 7 oracle must reject the fixture').toBe(false);
    expect(jsonSchemaToZod(schema).safeParse(value).success).toBe(false);
  });

  it.each(acceptanceCases)('$name', ({ schema, value }) => {
    expect(ajv.compile(schema)(value), 'Draft 7 oracle must accept the fixture').toBe(true);
    expect(jsonSchemaToZod(schema).safeParse(value).success).toBe(true);
  });

  it('resolves local references from a raw shape against the enclosing document', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { $ref: '#/$defs/name' } },
      required: ['name'],
      $defs: { name: { type: 'string' } },
    };
    const shape = z.object(jsonSchemaToZodShape(schema));

    expect(shape.safeParse({ name: 'Ada' }).success).toBe(true);
    expect(shape.safeParse({ name: 1 }).success).toBe(false);
  });

  it('keeps sibling defaults when a nested reference widens only its own property', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { $ref: '#/$defs/n' },
        enabled: { type: 'boolean', default: true },
      },
      $defs: { n: { type: 'string' } },
    };
    const parsed = jsonSchemaToZod(schema);

    expect(parsed.parse({ name: 'Ada' })).toEqual({ name: 'Ada', enabled: true });
    expect(parsed.safeParse({ name: 1 }).success).toBe(false);
  });

  it('keeps allOf branch defaults and stays strict over the union of declared keys', () => {
    const schema: JsonSchema = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'string', default: 'set' } } },
      ],
    };
    const parsed = jsonSchemaToZod(schema);

    expect(parsed.parse({ a: 'ready' })).toEqual({ a: 'ready', b: 'set' });
    expect(parsed.safeParse({ a: 'ready', c: 1 }).success).toBe(false);
  });

  it('normalizes Draft 4 exclusive bounds before the whole-schema guard runs', () => {
    const schema = {
      type: 'object',
      propertyNames: { pattern: '^[a-z]+$' },
      properties: { v: { type: 'number', minimum: 0, exclusiveMinimum: true } },
    } as unknown as JsonSchema;
    const parsed = jsonSchemaToZod(schema);

    expect(parsed.safeParse({ v: 0.5 }).success).toBe(true);
    expect(parsed.safeParse({ v: 0 }).success).toBe(false);
  });

  it('keeps Draft 4 exclusive flags and adjacent Draft 7 keywords active together', () => {
    const schema = {
      type: 'array',
      minimum: 0,
      exclusiveMinimum: true,
      contains: { const: 1 },
    } as unknown as JsonSchema;

    // Ajv intentionally cannot serve as the oracle for the Draft 4 boolean
    // bound. This value isolates `contains`, which remains a Draft 7 assertion
    // even when an OpenAPI 3.0 exporter emits the older bound spelling nearby.
    expect(jsonSchemaToZod(schema).safeParse([2]).success).toBe(false);
  });

  it('accepts every valid prefix of a closed Draft 7 tuple', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }],
      additionalItems: false,
    };
    const parsed = jsonSchemaToZod(schema);

    for (const value of [[], ['ready'], ['ready', 2]]) {
      expect(ajv.compile(schema)(value), 'Draft 7 oracle must accept the fixture').toBe(true);
      expect(parsed.safeParse(value).success).toBe(true);
    }
    for (const value of [
      [2, 'ready'],
      ['ready', 2, true],
    ]) {
      expect(ajv.compile(schema)(value), 'Draft 7 oracle must reject the fixture').toBe(false);
      expect(parsed.safeParse(value).success).toBe(false);
    }
  });

  it('allows unconstrained trailing values when additionalItems is omitted', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }],
    };
    const value = ['ready', 2, { extra: true }];

    expect(ajv.compile(schema)(value), 'Draft 7 oracle must accept the fixture').toBe(true);
    expect(jsonSchemaToZod(schema).safeParse(value).success).toBe(true);
  });

  it('validates trailing tuple values against schema-valued additionalItems', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: [{ type: 'string' }],
      additionalItems: { type: 'integer' },
    };
    const parsed = jsonSchemaToZod(schema);

    expect(parsed.safeParse(['ready', 1, 2]).success).toBe(true);
    expect(parsed.safeParse(['ready', 'wrong']).success).toBe(false);
  });

  it('does not round tiny nonzero numbers into integer multiples', () => {
    const schema: JsonSchema = { type: 'number', multipleOf: 3 };
    const value = 2 ** -1022;

    expect(ajv.compile(schema)(value), 'Draft 7 oracle must reject the fixture').toBe(false);
    expect(jsonSchemaToZod(schema).safeParse(value).success).toBe(false);
  });

  it('compares decimal multiples by their JSON number spelling', () => {
    const schema: JsonSchema = { type: 'number', multipleOf: 0.1 };
    expect(jsonSchemaToZod(schema).safeParse(0.3).success).toBe(true);
  });
});
