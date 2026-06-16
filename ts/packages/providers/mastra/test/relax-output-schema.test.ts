import { describe, it, expect } from 'vitest';
import { relaxOutputSchema } from '../src/relax-output-schema';

describe('relaxOutputSchema (issue #3047)', () => {
  it('adds "null" to a primitive type so API nulls validate', () => {
    expect(relaxOutputSchema({ type: 'string' })).toEqual({ type: ['string', 'null'] });
  });

  it('appends "null" to an existing type array without duplicating it', () => {
    expect(relaxOutputSchema({ type: ['string', 'number'] })).toEqual({
      type: ['string', 'number', 'null'],
    });
    expect(relaxOutputSchema({ type: ['string', 'null'] })).toEqual({
      type: ['string', 'null'],
    });
  });

  it('relaxes nested object properties and flips additionalProperties false → true', () => {
    const input = {
      type: 'object',
      additionalProperties: false,
      properties: {
        avatarUrl: { type: 'string' },
        assignee: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string' } },
        },
      },
      required: ['avatarUrl'],
    };

    expect(relaxOutputSchema(input)).toEqual({
      type: ['object', 'null'],
      additionalProperties: true,
      properties: {
        avatarUrl: { type: ['string', 'null'] },
        assignee: {
          type: ['object', 'null'],
          additionalProperties: true,
          properties: { name: { type: ['string', 'null'] } },
        },
      },
      required: ['avatarUrl'],
    });
  });

  it('adds additionalProperties: true to an object that omits it', () => {
    expect(relaxOutputSchema({ type: 'object', properties: {} })).toEqual({
      type: ['object', 'null'],
      additionalProperties: true,
      properties: {},
    });
  });

  it('does not touch additionalProperties on non-object (primitive) nodes', () => {
    expect(relaxOutputSchema({ type: 'string' })).not.toHaveProperty('additionalProperties');
  });

  it('preserves and recurses into a schema-valued additionalProperties', () => {
    const input = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };
    expect(relaxOutputSchema(input)).toEqual({
      type: ['object', 'null'],
      additionalProperties: { type: ['string', 'null'] },
    });
  });

  it('relaxes array item schemas', () => {
    const input = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'number' } },
      },
    };
    expect(relaxOutputSchema(input)).toEqual({
      type: ['array', 'null'],
      items: {
        type: ['object', 'null'],
        additionalProperties: true,
        properties: { id: { type: ['number', 'null'] } },
      },
    });
  });

  it('recurses into anyOf/oneOf/allOf branches', () => {
    const input = {
      anyOf: [{ type: 'string' }, { type: 'object', properties: { a: { type: 'boolean' } } }],
    };
    expect(relaxOutputSchema(input)).toEqual({
      anyOf: [
        { type: ['string', 'null'] },
        {
          type: ['object', 'null'],
          additionalProperties: true,
          properties: { a: { type: ['boolean', 'null'] } },
        },
      ],
    });
  });

  it('returns an empty schema unchanged (no type, no properties)', () => {
    expect(relaxOutputSchema({})).toEqual({});
  });

  it('does not mutate the input schema', () => {
    const input = {
      type: 'object',
      additionalProperties: false,
      properties: { a: { type: 'string' } },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    relaxOutputSchema(input);
    expect(input).toEqual(snapshot);
  });

  it('passes through non-object inputs untouched', () => {
    expect(relaxOutputSchema(null as unknown as object)).toBeNull();
    expect(relaxOutputSchema(undefined as unknown as object)).toBeUndefined();
  });
});
