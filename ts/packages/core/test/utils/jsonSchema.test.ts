import { describe, it, expect } from 'vitest';
import { deduplicateRequiredFields } from '../../src/utils/jsonSchema';

describe('deduplicateRequiredFields', () => {
  it('should remove duplicate entries from a top-level required array', () => {
    const schema = {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
      required: ['owner', 'repo', 'owner'],
    };

    const result = deduplicateRequiredFields(schema);
    expect(result.required).toEqual(['owner', 'repo']);
  });

  it('should leave schemas without duplicates unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    };

    const result = deduplicateRequiredFields(schema);
    expect(result.required).toEqual(['name', 'age']);
  });

  it('should handle schemas without a required array', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = deduplicateRequiredFields(schema);
    expect(result.required).toBeUndefined();
  });

  it('should deduplicate required arrays in nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
          required: ['street', 'city', 'street'],
        },
      },
      required: ['address'],
    };

    const result = deduplicateRequiredFields(schema);
    expect(result.required).toEqual(['address']);
    expect((result.properties as Record<string, any>).address.required).toEqual([
      'street',
      'city',
    ]);
  });

  it('should deduplicate required arrays inside allOf/anyOf/oneOf', () => {
    const schema = {
      type: 'object',
      allOf: [
        {
          type: 'object',
          properties: {
            foo: { type: 'string' },
            bar: { type: 'string' },
          },
          required: ['foo', 'bar', 'foo'],
        },
      ],
      anyOf: [
        {
          type: 'object',
          required: ['x', 'y', 'x'],
        },
      ],
    };

    const result = deduplicateRequiredFields(schema);
    expect((result.allOf as any[])[0].required).toEqual(['foo', 'bar']);
    expect((result.anyOf as any[])[0].required).toEqual(['x', 'y']);
  });

  it('should handle array items schemas', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name', 'id'],
      },
    };

    const result = deduplicateRequiredFields(schema);
    expect((result.items as Record<string, any>).required).toEqual(['id', 'name']);
  });

  it('should not mutate the original schema', () => {
    const original = {
      type: 'object',
      required: ['a', 'b', 'a'],
    };

    deduplicateRequiredFields(original);
    expect(original.required).toEqual(['a', 'b', 'a']);
  });

  it('should handle null/undefined input gracefully', () => {
    expect(deduplicateRequiredFields(null as any)).toBeNull();
    expect(deduplicateRequiredFields(undefined as any)).toBeUndefined();
  });
});
