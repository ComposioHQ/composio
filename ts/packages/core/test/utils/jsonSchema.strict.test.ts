import { describe, it, expect } from 'vitest';
import {
  deduplicateJsonSchemaRequiredArrays,
  dereferenceJsonSchema,
  toStrictJsonSchema,
} from '../../src/utils/jsonSchema';

const propertyOf = (schema: unknown, name: string): Record<string, unknown> =>
  ((schema as Record<string, unknown>).properties as Record<string, string>)[
    name
  ] as unknown as Record<string, unknown>;

describe('toStrictJsonSchema', () => {
  it('keeps an already-flat all-required object valid', () => {
    const input = {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    };

    const { schema, changes } = toStrictJsonSchema(input);

    expect(schema).toEqual(input);
    expect(changes).toEqual([]);
  });

  it('drops nested non-required properties and closes every object', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['url'],
        },
      },
      required: ['cfg'],
    });

    expect(schema).toEqual({
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          properties: {
            url: { type: 'string' },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
      required: ['cfg'],
      additionalProperties: false,
    });
  });

  it('requires every property when the object has no required array', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
    });

    expect(schema).toEqual({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    });
  });

  it('converts nullable type arrays into anyOf with an explicit null branch', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        id: { type: ['string', 'null'], description: 'identifier' },
      },
      required: ['id'],
    });

    expect(schema).toEqual({
      type: 'object',
      properties: {
        id: {
          anyOf: [{ type: 'string', description: 'identifier' }, { type: 'null' }],
          description: 'identifier',
        },
      },
      required: ['id'],
      additionalProperties: false,
    });
  });

  it('converts multi-type arrays into anyOf branches', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        value: { type: ['string', 'number'] },
      },
      required: ['value'],
    });

    const property = propertyOf(schema, 'value');
    expect(property.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
  });

  it('normalizes composition branches recursively', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        payload: {
          anyOf: [
            {
              type: 'object',
              properties: { inner: { type: 'string' }, extra: { type: 'string' } },
              required: ['inner'],
            },
            { type: 'null' },
          ],
        },
      },
      required: ['payload'],
    });

    const payload = propertyOf(schema, 'payload');
    expect(payload.anyOf[0]).toEqual({
      type: 'object',
      properties: { inner: { type: 'string' } },
      required: ['inner'],
      additionalProperties: false,
    });
  });

  it('normalizes array item schemas including tuples', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, tag: { type: 'string' } },
            required: ['id'],
          },
        },
        pair: {
          type: 'array',
          prefixItems: [
            { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
          ],
        },
      },
      required: ['rows', 'pair'],
    });

    const props = (schema as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(props.rows.items).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    });
    expect(props.pair.prefixItems[0]).toEqual({
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
      additionalProperties: false,
    });
  });

  it('strips annotation keywords and reports them', () => {
    const { schema, changes } = toStrictJsonSchema({
      type: 'object',
      properties: { name: { type: 'string', examples: ['a'], default: 'x' } },
      required: ['name'],
    });

    expect(propertyOf(schema, 'name')).toEqual({ type: 'string' });
    expect(changes.filter(change => change.reason === 'annotation-keyword-stripped')).toHaveLength(
      2
    );
  });

  it('reports dropped properties as changes without exceeding the cap', () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) properties[`p${i}`] = { type: 'string' };

    const { schema, changes } = toStrictJsonSchema({
      type: 'object',
      properties,
      required: ['p0'],
    });

    expect(Object.keys((schema as Record<string, unknown>).properties as object)).toEqual(['p0']);
    expect(changes.length).toBeLessThanOrEqual(50);
  });

  it('does not mutate the input schema', () => {
    const input = {
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          properties: { opt: { type: 'string' } },
        },
      },
      required: ['cfg'],
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    toStrictJsonSchema(input);

    expect(input).toEqual(snapshot);
  });

  it('is idempotent for composed pipelines', () => {
    const pipeline = (input: unknown): unknown =>
      deduplicateJsonSchemaRequiredArrays(
        toStrictJsonSchema(dereferenceJsonSchema(input, { onUnresolved: 'sentinel' })).schema
      );

    const once = pipeline({
      type: 'object',
      properties: {
        cfg: {
          $ref: '#/$defs/Config',
        },
      },
      required: ['cfg'],
      $defs: {
        Config: {
          type: 'object',
          properties: { url: { type: 'string' }, note: { type: 'string' } },
          required: ['url'],
        },
      },
    });

    expect(pipeline(once)).toEqual(once);
  });

  it('throws past the maximum nesting depth', () => {
    let deep: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 600; i++) {
      deep = { type: 'object', properties: { nest: deep }, required: ['nest'] };
    }

    expect(() => toStrictJsonSchema(deep)).toThrow(RangeError);
  });
});
