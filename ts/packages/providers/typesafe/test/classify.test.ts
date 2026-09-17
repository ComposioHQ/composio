import { JSONSchemaPropertySchema } from '@composio/core';
import { describe, expect, it } from 'vitest';
import { classifyProperty as classifyParsed } from '../src/classify';

const classifyProperty = (schema: unknown) =>
  classifyParsed(JSONSchemaPropertySchema.parse(schema));

describe('classifyProperty', () => {
  it('classifies a string enum as a closed set', () => {
    expect(classifyProperty({ type: 'string', enum: ['a', 'b'] })).toEqual({
      kind: 'enum',
      values: ['a', 'b'],
      nullable: false,
    });
  });

  it('reads anyOf and oneOf branches of consts and enums', () => {
    expect(classifyProperty({ anyOf: [{ const: 'open' }, { const: 'closed' }] })).toEqual({
      kind: 'enum',
      values: ['open', 'closed'],
      nullable: false,
    });
    expect(classifyProperty({ oneOf: [{ enum: ['a'] }, { type: 'null' }] })).toEqual({
      kind: 'enum',
      values: ['a'],
      nullable: true,
    });
  });

  it.each([
    [{ enum: ['a', null] }],
    [{ type: 'string', enum: ['a'], nullable: true }],
    [{ type: ['string', 'null'], enum: ['a'] }],
  ])('marks %j as nullable', schema => {
    expect(classifyProperty(schema)).toEqual({ kind: 'enum', values: ['a'], nullable: true });
  });

  it('classifies booleans, including a boolean enum', () => {
    expect(classifyProperty({ type: 'boolean' })).toEqual({ kind: 'boolean' });
    expect(classifyProperty({ enum: [true, false] })).toEqual({ kind: 'boolean' });
  });

  it.each([
    [{ type: 'boolean', enum: [false, true] }],
    [{ anyOf: [{ const: true }, { const: false }] }],
    [{ oneOf: [{ enum: [true] }, { enum: [false] }, { type: 'null' }] }],
    [{ enum: [true, false, null] }],
  ])('classifies %j as boolean, since it allows both values', schema => {
    expect(classifyProperty(schema)).toEqual({ kind: 'boolean' });
  });

  // A yes/no Choice could bind the value the schema forbids.
  it.each([
    [{ const: true }],
    [{ const: false }],
    [{ type: 'boolean', const: true }],
    [{ enum: [true] }],
    [{ type: 'boolean', enum: [false] }],
    [{ enum: [true, null] }],
    [{ anyOf: [{ const: true }] }],
    [{ oneOf: [{ enum: [false] }, { type: 'null' }] }],
  ])('treats the single-valued boolean %j as open-ended', schema => {
    expect(classifyProperty(schema)).toEqual({ kind: 'open' });
  });

  it('classifies an array of enum values and keeps maxItems', () => {
    expect(
      classifyProperty({ type: 'array', items: { type: 'string', enum: ['a', 'b'] }, maxItems: 1 })
    ).toEqual({ kind: 'enum_array', values: ['a', 'b'], maxItems: 1 });
  });

  it('keeps a single-member enum and a scalar const closed', () => {
    expect(classifyProperty({ enum: ['csv'] })).toEqual({
      kind: 'enum',
      values: ['csv'],
      nullable: false,
    });
    expect(classifyProperty({ const: 2 })).toEqual({ kind: 'enum', values: [2], nullable: false });
  });

  it('deduplicates members', () => {
    expect(classifyProperty({ enum: ['a', 'a', 'b'] })).toEqual({
      kind: 'enum',
      values: ['a', 'b'],
      nullable: false,
    });
  });

  it.each([
    ['mixed types', { enum: [1, '1'] }],
    ['a non-integer number', { enum: [1.5, 2] }],
    ['more than 254 members', { enum: Array.from({ length: 255 }, (_, index) => `v${index}`) }],
    ['254 members plus null', { enum: [...Array.from({ length: 254 }, (_, i) => `v${i}`), null] }],
    ['an enum next to a free string', { anyOf: [{ enum: ['a'] }, { type: 'string' }] }],
    ['a closed set nested in an object', { type: 'object', properties: { s: { enum: ['a'] } } }],
    ['the dereferencing sentinel', { type: 'object', additionalProperties: true }],
    ['a free string', { type: 'string' }],
    ['a number', { type: 'number' }],
    ['a date-time string', { type: 'string', format: 'date-time' }],
    ['tuple items', { type: 'array', items: [{ enum: ['a'] }] }],
    ['an array of free strings', { type: 'array', items: { type: 'string' } }],
    ['an array of nullable enums', { type: 'array', items: { enum: ['a', null] } }],
    ['a null-only enum', { enum: [null] }],
  ])('treats %s as open-ended', (_label, schema) => {
    expect(classifyProperty(schema)).toEqual({ kind: 'open' });
  });

  it('accepts exactly 254 members', () => {
    const values = Array.from({ length: 254 }, (_, index) => `v${index}`);
    expect(classifyProperty({ enum: values })).toEqual({ kind: 'enum', values, nullable: false });
  });
});
