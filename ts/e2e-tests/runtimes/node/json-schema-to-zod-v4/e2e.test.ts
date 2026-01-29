/**
 * @composio/json-schema-to-zod + Zod v4 e2e test
 *
 * Verifies that @composio/json-schema-to-zod works correctly with zod@4,
 * including basic schema conversion and parsing behavior tests.
 */

import { jsonSchemaToZod, type JsonSchema } from '@composio/json-schema-to-zod';
import { e2e } from '@e2e-tests/utils';
import { describe, it, expect } from 'bun:test';

e2e(import.meta.url, {
  nodeVersions: ['current'],
  defineTests: () => {
    describe('json-schema-to-zod with Zod v4', () => {
      describe('Basic functionality', () => {
        it('converts basic string schema', () => {
          const schema: JsonSchema = { type: 'string' };
          const zodSchema = jsonSchemaToZod(schema);
    
          expect(zodSchema.parse('hello')).toBe('hello');
          expect(() => zodSchema.parse(123)).toThrow();
        });
    
        it('converts object schema with validation', () => {
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
    
        it('converts array schema', () => {
          const schema: JsonSchema = {
            type: 'array',
            items: { type: 'string' },
          };
          const zodSchema = jsonSchemaToZod(schema);
    
          expect(zodSchema.parse(['one', 'two', 'three'])).toEqual(['one', 'two', 'three']);
          expect(() => zodSchema.parse(['one', 2])).toThrow();
        });
    
        it('validates email format', () => {
          const schema: JsonSchema = {
            type: 'string',
            format: 'email',
          };
          const zodSchema = jsonSchemaToZod(schema);
    
          expect(zodSchema.parse('test@example.com')).toBe('test@example.com');
          expect(() => zodSchema.parse('invalid-email')).toThrow();
        });
    
        it('handles complex nested schemas', () => {
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
    
        it('handles anyOf schemas', () => {
          const schema: JsonSchema = {
            anyOf: [{ type: 'string' }, { type: 'number' }],
          };
          const zodSchema = jsonSchemaToZod(schema);
    
          expect(zodSchema.parse('hello')).toBe('hello');
          expect(zodSchema.parse(42)).toBe(42);
          expect(() => zodSchema.parse(true)).toThrow();
        });
      });
    
      describe('Parsing behavior', () => {
        it('converts basic schemas and verifies parsing behavior', () => {
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
    
          expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
          expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
          expect(() => zodSchema.parse({ age: 30 })).toThrow();
          expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
        });
    
        it('handles additionalProperties: true', () => {
          const schema: JsonSchema = {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: true,
          };
    
          const zodSchema = jsonSchemaToZod(schema);
    
          expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
          expect(zodSchema.parse({ name: 'John', extra: 'allowed', another: 123 })).toEqual({
            name: 'John',
            extra: 'allowed',
            another: 123,
          });
        });
    
        it('handles additionalProperties with type constraint', () => {
          const schema: JsonSchema = {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: { type: 'number' },
          };
    
          const zodSchema = jsonSchemaToZod(schema);
    
          expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
          expect(zodSchema.parse({ name: 'John', age: 30, count: 5 })).toEqual({
            name: 'John',
            age: 30,
            count: 5,
          });
          expect(() => zodSchema.parse({ name: 'John', extra: 'string' })).toThrow();
        });
    
        it('handles nested objects with different additionalProperties settings', () => {
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
    
          const validData = {
            strictChild: { name: 'John' },
            flexibleChild: { age: 30, extra: 'allowed' },
            extraString: 'this should be a string',
          };
          expect(zodSchema.parse(validData)).toEqual(validData);
    
          expect(() =>
            zodSchema.parse({
              strictChild: { name: 'John', extra: 'not allowed' },
            })
          ).toThrow();
    
          expect(() =>
            zodSchema.parse({
              extraNumber: 123,
            })
          ).toThrow();
        });
    
        it('handles complex nested arrays', () => {
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
            zodSchema.parse([{ tags: ['a', 'b'] }])
          ).toThrow();
        });
    
        it('handles union types with anyOf', () => {
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
    
          expect(() => zodSchema.parse('ab')).toThrow();
          expect(() => zodSchema.parse(-1)).toThrow();
          expect(() => zodSchema.parse({ foo: 'bar' })).toThrow();
        });
      });
    });
  }
});

