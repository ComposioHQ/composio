import { describe, it, expect } from 'vitest';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import type { JsonSchema } from '@composio/json-schema-to-zod';

describe('E2E with Zod v4 - Round-trip conversion with native toJSONSchema', () => {
  it('should convert basic schemas and verify parsing behavior', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
      additionalProperties: false,
    };

    const zodSchema = jsonSchemaToZod(schema);

    // Test parsing behavior
    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
    expect(() => zodSchema.parse({ age: 30 })).toThrow();
    expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
  });

  it('should handle additionalProperties: true', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: true,
    };

    const zodSchema = jsonSchemaToZod(schema);

    // Test parsing behavior
    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(zodSchema.parse({ name: 'John', extra: 'allowed', another: 123 })).toEqual({
      name: 'John',
      extra: 'allowed',
      another: 123,
    });
  });

  it('should handle additionalProperties with type constraint', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: { type: 'number' },
    };

    const zodSchema = jsonSchemaToZod(schema);

    // Test parsing behavior
    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(zodSchema.parse({ name: 'John', age: 30, count: 5 })).toEqual({
      name: 'John',
      age: 30,
      count: 5,
    });
    expect(() => zodSchema.parse({ name: 'John', extra: 'string' })).toThrow();
  });

  it('should handle nested objects with different additionalProperties settings', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        strictChild: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          additionalProperties: false,
        },
        flexibleChild: {
          type: 'object',
          properties: {
            age: { type: 'number' },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: { type: 'string' },
    };

    const zodSchema = jsonSchemaToZod(schema);

    // Test parsing behavior
    const validData = {
      strictChild: { name: 'John' },
      flexibleChild: { age: 30, extra: 'allowed' },
      extraString: 'this should be a string',
    };
    expect(zodSchema.parse(validData)).toEqual(validData);

    // Test invalid cases
    expect(() =>
      zodSchema.parse({
        strictChild: { name: 'John', extra: 'not allowed' },
      })
    ).toThrow();

    expect(() =>
      zodSchema.parse({
        extraNumber: 123, // should be string according to additionalProperties
      })
    ).toThrow();
  });

  it('should handle complex nested arrays', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['id'],
      },
    };

    const zodSchema = jsonSchemaToZod(schema);

    const validData = [{ id: 1, tags: ['a', 'b'] }, { id: 2, tags: ['c'] }, { id: 3 }];
    expect(zodSchema.parse(validData)).toEqual(validData);

    expect(() =>
      zodSchema.parse([
        { tags: ['a', 'b'] }, // missing required id
      ])
    ).toThrow();
  });

  it('should handle union types with anyOf', () => {
    const schema: JsonSchema = {
      anyOf: [
        { type: 'string', minLength: 3 },
        { type: 'number', minimum: 0 },
        {
          type: 'object',
          properties: {
            type: { type: 'string' },
          },
          required: ['type'],
        },
      ],
    };

    const zodSchema = jsonSchemaToZod(schema);

    expect(zodSchema.parse('hello')).toBe('hello');
    expect(zodSchema.parse(42)).toBe(42);
    expect(zodSchema.parse({ type: 'custom' })).toEqual({ type: 'custom' });

    expect(() => zodSchema.parse('ab')).toThrow(); // too short
    expect(() => zodSchema.parse(-1)).toThrow(); // negative
    expect(() => zodSchema.parse({ foo: 'bar' })).toThrow(); // missing required type
  });
});
