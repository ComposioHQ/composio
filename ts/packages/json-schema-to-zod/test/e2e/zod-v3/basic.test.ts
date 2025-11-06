import { describe, it, expect } from 'vitest';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import type { JsonSchema } from '@composio/json-schema-to-zod';

describe('E2E with Zod v3 - Basic functionality', () => {
  it('should convert basic string schema', () => {
    const schema: JsonSchema = { type: 'string' };
    const zodSchema = jsonSchemaToZod(schema);

    // Note: instanceof check doesn't work reliably across zod versions
    expect(zodSchema.parse('hello')).toBe('hello');
    expect(() => zodSchema.parse(123)).toThrow();
  });

  it('should convert object schema with validation', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number', minimum: 0 },
      },
      required: ['name'],
    };
    const zodSchema = jsonSchemaToZod(schema);

    expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(() => zodSchema.parse({ age: 30 })).toThrow();
  });

  it('should convert array schema', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'string' },
    };
    const zodSchema = jsonSchemaToZod(schema);

    expect(zodSchema.parse(['one', 'two', 'three'])).toEqual(['one', 'two', 'three']);
    expect(() => zodSchema.parse(['one', 2])).toThrow();
  });

  it('should validate email format', () => {
    const schema: JsonSchema = {
      type: 'string',
      format: 'email',
    };
    const zodSchema = jsonSchemaToZod(schema);

    expect(zodSchema.parse('test@example.com')).toBe('test@example.com');
    expect(() => zodSchema.parse('invalid-email')).toThrow();
  });

  it('should handle complex nested schemas', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'string' },
                },
                required: ['type', 'value'],
              },
            },
          },
          required: ['name'],
        },
      },
      required: ['user'],
    };
    const zodSchema = jsonSchemaToZod(schema);

    const validData = {
      user: {
        name: 'Jane Doe',
        contacts: [
          { type: 'email', value: 'jane@example.com' },
          { type: 'phone', value: '555-1234' },
        ],
      },
    };
    expect(zodSchema.parse(validData)).toEqual(validData);
  });

  it('should handle anyOf schemas', () => {
    const schema: JsonSchema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };
    const zodSchema = jsonSchemaToZod(schema);

    expect(zodSchema.parse('hello')).toBe('hello');
    expect(zodSchema.parse(42)).toBe(42);
    expect(() => zodSchema.parse(true)).toThrow();
  });
});
