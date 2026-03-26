import { describe, expect, it } from 'vitest';
import { deduplicateRequiredFields } from '../../src/utils/jsonSchema';

describe('deduplicateRequiredFields', () => {
  it('deduplicates top-level required entries without changing order', () => {
    const schema = {
      type: 'object',
      required: ['owner', 'repo', 'owner', 'repo', 'name'],
    };

    expect(deduplicateRequiredFields(schema)).toEqual({
      type: 'object',
      required: ['owner', 'repo', 'name'],
    });
  });

  it('recursively sanitizes nested schemas in common JSON Schema keywords', () => {
    const schema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          required: ['mode', 'mode'],
        },
      },
      additionalProperties: {
        type: 'object',
        required: ['enabled', 'enabled'],
      },
      $defs: {
        nested: {
          type: 'object',
          required: ['id', 'id', 'slug'],
        },
      },
      allOf: [
        {
          type: 'object',
          required: ['foo', 'foo'],
        },
      ],
      prefixItems: [
        {
          type: 'object',
          required: ['bar', 'bar'],
        },
      ],
    };

    const result = deduplicateRequiredFields(schema);

    expect((result.properties as Record<string, any>).config.required).toEqual(['mode']);
    expect((result.additionalProperties as Record<string, any>).required).toEqual(['enabled']);
    expect((result.$defs as Record<string, any>).nested.required).toEqual(['id', 'slug']);
    expect((result.allOf as any[])[0].required).toEqual(['foo']);
    expect((result.prefixItems as any[])[0].required).toEqual(['bar']);
  });

  it('handles array item schemas', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'id'],
      },
    };

    expect((deduplicateRequiredFields(schema).items as Record<string, unknown>).required).toEqual([
      'id',
      'name',
    ]);
  });

  it('does not mutate the original schema', () => {
    const schema = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          required: ['a', 'a'],
        },
      },
      required: ['nested', 'nested'],
    };

    const original = structuredClone(schema);

    deduplicateRequiredFields(schema);

    expect(schema).toEqual(original);
  });

  it('returns non-object inputs unchanged', () => {
    expect(deduplicateRequiredFields(null)).toBeNull();
    expect(deduplicateRequiredFields(undefined)).toBeUndefined();
    expect(deduplicateRequiredFields('schema')).toBe('schema');
  });
});
