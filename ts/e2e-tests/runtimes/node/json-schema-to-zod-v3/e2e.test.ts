/**
 * @composio/json-schema-to-zod + Zod v3 e2e test
 *
 * Verifies that @composio/json-schema-to-zod works correctly with zod@3.25.76,
 * including basic schema conversion and round-trip tests with zod-to-json-schema.
 */

import { jsonSchemaToZod, type JsonSchema } from '@composio/json-schema-to-zod';
import { e2e } from '@e2e-tests/utils';
import { describe, it, expect } from 'bun:test';
import zodToJsonSchema from 'zod-to-json-schema';

e2e(import.meta.url, {
  nodeVersions: ['current'],
  defineTests: () => {
    describe('json-schema-to-zod with Zod v3', () => {
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
    
      describe('Round-trip conversion', () => {
        it('preserves additionalProperties: true for empty objects', () => {
          const schema: JsonSchema = {
            type: 'object',
            additionalProperties: true,
          };
    
          const zodSchema = jsonSchemaToZod(schema);
          // @ts-expect-error Type instantiation is excessively deep and possibly infinite.
          const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
          // @ts-expect-error Property 'additionalProperties' does not exist on type.
          expect(convertedBack.additionalProperties).toBe(true);
          // @ts-expect-error Property 'type' does not exist on type
          expect(convertedBack.type).toBe('object');
    
          expect(zodSchema.parse({})).toEqual({});
          expect(zodSchema.parse({ any: 'value', number: 123 })).toEqual({ any: 'value', number: 123 });
        });
    
        it('preserves additionalProperties: true for objects with properties', () => {
          const schema: JsonSchema = {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name'],
            additionalProperties: true,
          };
    
          const zodSchema = jsonSchemaToZod(schema);
          const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
    
          // @ts-expect-error Property 'additionalProperties' does not exist on type.
          expect(convertedBack.additionalProperties).toBe(true);
          // @ts-expect-error Type instantiation is excessively deep and possibly infinite.
          expect(convertedBack.properties).toBeDefined();
          // @ts-expect-error Property 'required' does not exist on type
          expect(convertedBack.required).toEqual(['name']);
    
          expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
          expect(zodSchema.parse({ name: 'John', age: 30, extra: 'field' })).toEqual({
            name: 'John',
            age: 30,
            extra: 'field',
          });
        });
    
        it('preserves additionalProperties: false for empty objects', () => {
          const schema: JsonSchema = {
            type: 'object',
            additionalProperties: false,
          };
    
          const zodSchema = jsonSchemaToZod(schema);
          const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
    
          // zod-to-json-schema may convert z.object({}).strict() to { not: {} }
          // which is semantically equivalent to additionalProperties: false
          const additionalPropsValid =
            // @ts-expect-error Property 'additionalProperties' does not exist on type.
            convertedBack.additionalProperties === false ||
            // @ts-expect-error Property 'not' does not exist on type.
            (convertedBack.not && typeof convertedBack.not === 'object');
          expect(additionalPropsValid).toBe(true);
          // @ts-expect-error Property 'type' does not exist on type.
          expect(convertedBack.type).toBe('object');
    
          expect(zodSchema.parse({})).toEqual({});
          expect(() => zodSchema.parse({ extra: 'field' })).toThrow();
        });
    
        it('preserves additionalProperties: false for objects with properties', () => {
          const schema: JsonSchema = {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: false,
          };
    
          const zodSchema = jsonSchemaToZod(schema);
          const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
    
          // @ts-expect-error Property 'additionalProperties' does not exist on type.
          expect(convertedBack.additionalProperties).toBe(false);
          // @ts-expect-error Property 'properties' does not exist on type.
          expect(convertedBack.properties).toBeDefined();
    
          expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
          expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
        });
    
        it('handles additionalProperties with type schema', () => {
          const schema: JsonSchema = {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: { type: 'number' },
          };
    
          const zodSchema = jsonSchemaToZod(schema);
          const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
    
          // @ts-expect-error Property 'additionalProperties' does not exist on type.
          expect(convertedBack.additionalProperties).toEqual({ type: 'number' });
          // @ts-expect-error Property 'properties' does not exist on type.
          expect(convertedBack.properties).toBeDefined();
    
          expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
          expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
          expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
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
          const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
    
          // @ts-expect-error Property 'additionalProperties' does not exist on type.
          expect(convertedBack.additionalProperties).toEqual({ type: 'string' });
          // @ts-expect-error Property 'properties' does not exist on type.
          expect((convertedBack.properties as Record<string, unknown>)?.strictChild).toBeDefined();
          // @ts-expect-error Property 'properties' does not exist on type.
          expect((convertedBack.properties as Record<string, unknown>)?.flexibleChild).toBeDefined();
    
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
      });
    });
  },
});

