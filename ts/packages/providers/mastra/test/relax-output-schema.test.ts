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

  it('relaxes nested object properties, flips additionalProperties false → true, and drops required', () => {
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

    // `required` is dropped (API may omit `avatarUrl` entirely), nested objects
    // are relaxed the same way, and nothing else is altered.
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
    });
  });

  it('drops required so an omitted field still validates (issue #3047 gap)', () => {
    const input = {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name'],
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    };
    expect(relaxOutputSchema(input)).toEqual({
      type: ['object', 'null'],
      additionalProperties: true,
      properties: { id: { type: ['string', 'null'] }, name: { type: ['string', 'null'] } },
    });
  });

  it('widens an enum to also admit null without dropping the other members', () => {
    expect(relaxOutputSchema({ type: 'string', enum: ['open', 'closed'] })).toEqual({
      type: ['string', 'null'],
      enum: ['open', 'closed', null],
    });
    // idempotent: an enum that already allows null is left as-is
    expect(relaxOutputSchema({ type: 'string', enum: ['open', null] })).toEqual({
      type: ['string', 'null'],
      enum: ['open', null],
    });
  });

  it('converts const into a nullable two-member enum', () => {
    expect(relaxOutputSchema({ const: 'fixed' })).toEqual({ enum: ['fixed', null] });
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

  it('leaves a `not` subschema untouched so relaxation never narrows validation', () => {
    // `not` negates its subschema: relaxing the inner schema (making it
    // nullable) would *reject* values that were valid before (e.g. `null` under
    // `not: { type: 'string' }`), violating the only-widen invariant. The inner
    // schema must therefore be preserved verbatim, even when nested in an object
    // that is itself relaxed.
    expect(relaxOutputSchema({ not: { type: 'string' } })).toEqual({ not: { type: 'string' } });
    expect(
      relaxOutputSchema({
        type: 'object',
        additionalProperties: false,
        properties: { x: { not: { type: 'string' } } },
      })
    ).toEqual({
      type: ['object', 'null'],
      additionalProperties: true,
      properties: { x: { not: { type: 'string' } } },
    });
  });

  it('returns an empty schema unchanged (no type, no properties)', () => {
    expect(relaxOutputSchema({})).toEqual({});
  });

  it('does not mutate the input schema (including required/enum/const paths)', () => {
    const input = {
      type: 'object',
      additionalProperties: false,
      required: ['a'],
      properties: {
        a: { type: 'string', enum: ['x', 'y'] },
        b: { const: 'z' },
      },
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
