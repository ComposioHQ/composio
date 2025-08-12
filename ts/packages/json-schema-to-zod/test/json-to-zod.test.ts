import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { jsonSchemaToZod } from '../src/json-schema-to-zod';
import type { JsonSchema } from '../src/types';

describe('jsonSchemaToZod', () => {
  describe('Basic Types', () => {
    it('should convert string schema', () => {
      const schema: JsonSchema = {
        type: 'string',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema).toBeInstanceOf(z.ZodString);
      expect(zodSchema.parse('test')).toBe('test');
      expect(() => zodSchema.parse(123)).toThrow();
    });

    it('should convert number schema', () => {
      const schema: JsonSchema = {
        type: 'number',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema).toBeInstanceOf(z.ZodNumber);
      expect(zodSchema.parse(123)).toBe(123);
      expect(() => zodSchema.parse('123')).toThrow();
    });

    it('should convert integer schema', () => {
      const schema: JsonSchema = {
        type: 'integer',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(123)).toBe(123);
      expect(() => zodSchema.parse(123.45)).toThrow();
    });

    it('should convert boolean schema', () => {
      const schema: JsonSchema = {
        type: 'boolean',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema).toBeInstanceOf(z.ZodBoolean);
      expect(zodSchema.parse(true)).toBe(true);
      expect(() => zodSchema.parse('true')).toThrow();
    });

    it('should convert null schema', () => {
      const schema: JsonSchema = {
        type: 'null',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema).toBeInstanceOf(z.ZodNull);
      expect(zodSchema.parse(null)).toBe(null);
      expect(() => zodSchema.parse(undefined)).toThrow();
    });
  });

  describe('String Formats', () => {
    it('should validate email format', () => {
      const schema: JsonSchema = {
        type: 'string',
        format: 'email',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('test@example.com')).toBe('test@example.com');
      expect(() => zodSchema.parse('invalid-email')).toThrow();
    });

    it('should validate date-time format', () => {
      const schema: JsonSchema = {
        type: 'string',
        format: 'date-time',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('2024-03-20T12:00:00Z')).toBe('2024-03-20T12:00:00Z');
      expect(() => zodSchema.parse('invalid-date')).toThrow();
    });

    it('should validate uuid format', () => {
      const schema: JsonSchema = {
        type: 'string',
        format: 'uuid',
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('123e4567-e89b-12d3-a456-426614174000')).toBe(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(() => zodSchema.parse('invalid-uuid')).toThrow();
    });
  });

  describe('Number Validations', () => {
    it('should validate minimum and maximum', () => {
      const schema: JsonSchema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(50)).toBe(50);
      expect(() => zodSchema.parse(-1)).toThrow();
      expect(() => zodSchema.parse(101)).toThrow();
    });

    it('should validate exclusive minimum and maximum', () => {
      const schema: JsonSchema = {
        type: 'number',
        exclusiveMinimum: 0,
        exclusiveMaximum: 100,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(50)).toBe(50);
      expect(() => zodSchema.parse(0)).toThrow();
      expect(() => zodSchema.parse(100)).toThrow();
    });

    it('should validate multipleOf', () => {
      const schema: JsonSchema = {
        type: 'number',
        multipleOf: 5,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(15)).toBe(15);
      expect(() => zodSchema.parse(17)).toThrow();
    });

    it('should handle generic min and max properties for numbers', () => {
      const schema: JsonSchema = {
        type: 'number',
        min: 0,
        max: 100,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(50)).toBe(50);
      expect(() => zodSchema.parse(-1)).toThrow();
      expect(() => zodSchema.parse(101)).toThrow();
    });

    it('should prioritize minimum/maximum over min/max for numbers', () => {
      const schema: JsonSchema = {
        type: 'number',
        minimum: 10,
        maximum: 90,
        min: 0,
        max: 100,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(50)).toBe(50);
      expect(zodSchema.parse(10)).toBe(10);
      expect(zodSchema.parse(90)).toBe(90);
      expect(() => zodSchema.parse(5)).toThrow(); // Uses minimum (10), not min (0)
      expect(() => zodSchema.parse(95)).toThrow(); // Uses maximum (90), not max (100)
    });
  });

  describe('String Validations', () => {
    it('should handle generic min and max properties for strings', () => {
      const schema: JsonSchema = {
        type: 'string',
        min: 3,
        max: 10,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('hello')).toBe('hello');
      expect(() => zodSchema.parse('hi')).toThrow();
      expect(() => zodSchema.parse('this is too long')).toThrow();
    });

    it('should prioritize minLength/maxLength over min/max for strings', () => {
      const schema: JsonSchema = {
        type: 'string',
        minLength: 5,
        maxLength: 8,
        min: 3,
        max: 10,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('hello')).toBe('hello');
      expect(zodSchema.parse('testing')).toBe('testing');
      expect(() => zodSchema.parse('test')).toThrow(); // Uses minLength (5), not min (3)
      expect(() => zodSchema.parse('toolongstring')).toThrow(); // Uses maxLength (8), not max (10)
    });
  });

  describe('Object Schemas', () => {
    it('should validate required properties', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(() => zodSchema.parse({ age: 30 })).toThrow();
    });

    it('should validate additional properties when set to false', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
    });

    it('should allow any additional properties when set to true', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: true,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(zodSchema.parse({ name: 'John', extra: 'field' })).toEqual({
        name: 'John',
        extra: 'field',
      });
      expect(zodSchema.parse({ name: 'John', age: 30, city: 'NYC' })).toEqual({
        name: 'John',
        age: 30,
        city: 'NYC',
      });
    });

    it('should validate additional properties against a schema', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: { type: 'number' },
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({
        name: 'John',
        age: 30,
      });
      expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
    });

    it('should validate additional properties with complex schema', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            count: { type: 'number' },
          },
          required: ['value'],
        },
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(
        zodSchema.parse({
          name: 'John',
          metadata: { value: 'test', count: 5 },
        })
      ).toEqual({
        name: 'John',
        metadata: { value: 'test', count: 5 },
      });
      expect(
        zodSchema.parse({
          name: 'John',
          metadata: { value: 'test' },
        })
      ).toEqual({
        name: 'John',
        metadata: { value: 'test' },
      });
      expect(() =>
        zodSchema.parse({
          name: 'John',
          metadata: { count: 5 }, // missing required 'value'
        })
      ).toThrow();
    });

    it('should allow any additional properties when additionalProperties is not specified', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(zodSchema.parse({ name: 'John', extra: 'field' })).toEqual({
        name: 'John',
        extra: 'field',
      });
    });

    it('should handle additionalProperties with patternProperties', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        patternProperties: {
          '^prefix_': { type: 'string' },
        },
        additionalProperties: { type: 'number' },
      };
      const zodSchema = jsonSchemaToZod(schema);

      // Should allow defined properties
      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });

      // Should allow pattern properties
      expect(
        zodSchema.parse({
          name: 'John',
          prefix_test: 'value',
        })
      ).toEqual({
        name: 'John',
        prefix_test: 'value',
      });

      // Should allow additional properties matching the schema
      expect(
        zodSchema.parse({
          name: 'John',
          age: 30,
        })
      ).toEqual({
        name: 'John',
        age: 30,
      });

      // Should reject additional properties not matching the schema
      expect(() =>
        zodSchema.parse({
          name: 'John',
          extra: 'field', // string, but additionalProperties expects number
        })
      ).toThrow();
    });

    it('should handle object with no properties but with additionalProperties schema', () => {
      const schema: JsonSchema = {
        type: 'object',
        additionalProperties: { type: 'string' },
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({})).toEqual({});
      expect(zodSchema.parse({ key1: 'value1', key2: 'value2' })).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
      expect(() => zodSchema.parse({ key1: 123 })).toThrow();
    });

    it('should handle additionalProperties: false with patternProperties', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        patternProperties: {
          '^prefix_': { type: 'string' },
        },
        additionalProperties: false,
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(
        zodSchema.parse({
          name: 'John',
          prefix_test: 'value',
        })
      ).toEqual({
        name: 'John',
        prefix_test: 'value',
      });

      // Should reject properties that don't match patterns or defined properties
      expect(() =>
        zodSchema.parse({
          name: 'John',
          extra: 'field',
        })
      ).toThrow();
    });

    it('should handle empty object with additionalProperties: true', () => {
      const schema: JsonSchema = {
        type: 'object',
        additionalProperties: true,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({})).toEqual({});
      expect(zodSchema.parse({ any: 'value', another: 123 })).toEqual({
        any: 'value',
        another: 123,
      });
    });

    it('should handle empty object with additionalProperties: false', () => {
      const schema: JsonSchema = {
        type: 'object',
        additionalProperties: false,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({})).toEqual({});
      expect(() => zodSchema.parse({ any: 'value' })).toThrow();
    });

    it('should handle nested additionalProperties', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: { type: 'number' },
          },
        },
        additionalProperties: { type: 'string' },
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(
        zodSchema.parse({
          config: { name: 'test', timeout: 5000 },
          env: 'production',
        })
      ).toEqual({
        config: { name: 'test', timeout: 5000 },
        env: 'production',
      });

      // Should reject nested additional properties that don't match schema
      expect(() =>
        zodSchema.parse({
          config: { name: 'test', timeout: 'invalid' }, // should be number
        })
      ).toThrow();

      // Should reject top-level additional properties that don't match schema
      expect(() =>
        zodSchema.parse({
          config: { name: 'test' },
          count: 123, // should be string
        })
      ).toThrow();
    });

    it('should validate pattern properties', () => {
      const schema: JsonSchema = {
        type: 'object',
        patternProperties: {
          '^prefix_': { type: 'string' },
        },
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse({ prefix_one: 'value1', prefix_two: 'value2' })).toEqual({
        prefix_one: 'value1',
        prefix_two: 'value2',
      });
      expect(() => zodSchema.parse({ prefix_one: 123 })).toThrow();
    });
  });

  describe('Array Schemas', () => {
    it('should validate array items', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(['one', 'two'])).toEqual(['one', 'two']);
      expect(() => zodSchema.parse(['one', 2])).toThrow();
    });

    it('should validate tuple items', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(['test', 123])).toEqual(['test', 123]);
      expect(() => zodSchema.parse(['test', 'wrong'])).toThrow();
    });

    it('should validate array length', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(['one'])).toEqual(['one']);
      expect(zodSchema.parse(['one', 'two', 'three'])).toEqual(['one', 'two', 'three']);
      expect(() => zodSchema.parse([])).toThrow();
      expect(() => zodSchema.parse(['one', 'two', 'three', 'four'])).toThrow();
    });

    it('should handle generic min and max properties for arrays', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
        min: 1,
        max: 3,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(['one'])).toEqual(['one']);
      expect(zodSchema.parse(['one', 'two', 'three'])).toEqual(['one', 'two', 'three']);
      expect(() => zodSchema.parse([])).toThrow();
      expect(() => zodSchema.parse(['one', 'two', 'three', 'four'])).toThrow();
    });

    it('should prioritize minItems/maxItems over min/max for arrays', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 4,
        min: 1,
        max: 3,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(['one', 'two'])).toEqual(['one', 'two']);
      expect(zodSchema.parse(['one', 'two', 'three', 'four'])).toEqual([
        'one',
        'two',
        'three',
        'four',
      ]);
      expect(() => zodSchema.parse(['one'])).toThrow(); // Uses minItems (2), not min (1)
      expect(() => zodSchema.parse(['one', 'two', 'three', 'four', 'five'])).toThrow(); // Uses maxItems (4), not max (3)
    });

    it('should handle arrays with anyOf patterns', () => {
      const schema: JsonSchema = {
        type: 'array',
        anyOf: [
          {
            type: 'array',
            items: { type: 'string' },
          },
          {
            type: 'array',
            items: { type: 'number' },
          },
        ],
      };
      const zodSchema = jsonSchemaToZod(schema);

      // Should accept string arrays
      expect(zodSchema.parse(['hello', 'world'])).toEqual(['hello', 'world']);

      // Should accept number arrays
      expect(zodSchema.parse([1, 2, 3])).toEqual([1, 2, 3]);

      // Should accept mixed arrays (union of item types)
      expect(zodSchema.parse(['hello', 123])).toEqual(['hello', 123]);
    });

    it('should handle arrays with anyOf at top level without explicit types', () => {
      const schema: JsonSchema = {
        type: 'array',
        anyOf: [
          {
            items: { type: 'string' },
          },
          {
            items: { type: 'number' },
          },
        ],
      };
      const zodSchema = jsonSchemaToZod(schema);

      // Should accept string arrays
      expect(zodSchema.parse(['hello', 'world'])).toEqual(['hello', 'world']);

      // Should accept number arrays
      expect(zodSchema.parse([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should handle arrays with object items having default null', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: { type: 'string', default: null },
          },
          required: ['name'],
        },
      };
      const zodSchema = jsonSchemaToZod(schema);

      // Should apply default null for missing status
      expect(zodSchema.parse([{ name: 'test1' }, { name: 'test2', status: 'active' }])).toEqual([
        { name: 'test1', status: null },
        { name: 'test2', status: 'active' },
      ]);

      // Should fail for missing required field
      expect(() => zodSchema.parse([{ status: 'active' }])).toThrow();
    });

    it('should handle nested arrays', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' },
        },
      };
      const zodSchema = jsonSchemaToZod(schema);

      expect(
        zodSchema.parse([
          [1, 2],
          [3, 4, 5],
        ])
      ).toEqual([
        [1, 2],
        [3, 4, 5],
      ]);
      expect(() => zodSchema.parse([['string', 2]])).toThrow();
    });
  });

  describe('Enum Schemas', () => {
    it('should validate string enums', () => {
      const schema: JsonSchema = {
        type: 'string',
        enum: ['one', 'two', 'three'],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('one')).toBe('one');
      expect(() => zodSchema.parse('four')).toThrow();
    });

    it('should validate mixed type enums', () => {
      const schema: JsonSchema = {
        enum: ['string', 123, true],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('string')).toBe('string');
      expect(zodSchema.parse(123)).toBe(123);
      expect(zodSchema.parse(true)).toBe(true);
      expect(() => zodSchema.parse('invalid')).toThrow();
    });
  });

  describe('Combining Schemas', () => {
    it('should validate anyOf', () => {
      const schema: JsonSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse('test')).toBe('test');
      expect(zodSchema.parse(123)).toBe(123);
      expect(() => zodSchema.parse(true)).toThrow();
    });

    it('should validate oneOf', () => {
      const schema: JsonSchema = {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'number', maximum: 0 },
        ],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(1)).toBe(1);
      expect(zodSchema.parse(-1)).toBe(-1);
      expect(() => zodSchema.parse(0)).toThrow(); // Should fail as 0 matches both schemas
    });

    it('should validate allOf', () => {
      const schema: JsonSchema = {
        allOf: [
          { type: 'number', minimum: 0 },
          { type: 'number', maximum: 100 },
        ],
      };
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.parse(50)).toBe(50);
      expect(() => zodSchema.parse(-1)).toThrow();
      expect(() => zodSchema.parse(101)).toThrow();
    });
  });

  describe('Complex Nested Schemas', () => {
    it('should validate deeply nested objects', () => {
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
                    type: { type: 'string', enum: ['email', 'phone'] },
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
          name: 'John Doe',
          contacts: [
            { type: 'email', value: 'john@example.com' },
            { type: 'phone', value: '1234567890' },
          ],
        },
      };

      expect(zodSchema.parse(validData)).toEqual(validData);
      expect(() =>
        zodSchema.parse({
          user: {
            name: 'John Doe',
            contacts: [{ type: 'invalid', value: 'test' }],
          },
        })
      ).toThrow();
    });
  });

  describe('Schema Metadata and Constraints', () => {
    it('should handle required fields and descriptions', () => {
      const schema: JsonSchema = {
        type: 'object',
        description: 'A user profile object',
        properties: {
          username: {
            type: 'string',
            description: "The user's display name",
          },
          email: {
            type: 'string',
            description: "The user's email address",
            format: 'email',
          },
          age: {
            type: 'number',
            description: "User's age in years",
          },
        },
        required: ['username', 'email'],
      };

      const zodSchema = jsonSchemaToZod(schema);

      // Test description
      expect(zodSchema.description).toBe('A user profile object');

      // Test required fields
      expect(() => zodSchema.parse({})).toThrow();
      expect(() => zodSchema.parse({ username: 'test' })).toThrow();
      expect(() => zodSchema.parse({ email: 'test@example.com' })).toThrow();

      // Valid data should pass
      expect(
        zodSchema.parse({
          username: 'testuser',
          email: 'test@example.com',
        })
      ).toEqual({
        username: 'testuser',
        email: 'test@example.com',
      });

      // Optional field should be allowed to be missing
      expect(
        zodSchema.parse({
          username: 'testuser',
          email: 'test@example.com',
        })
      ).toEqual({
        username: 'testuser',
        email: 'test@example.com',
      });
    });

    it('should handle properties without type field', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          withType: {
            type: 'string',
            description: 'Property with type',
          },
          withoutType: {
            description: 'Property without type',
            default: 'default value',
          },
          withAnyOf: {
            anyOf: [{ type: 'string' }, { type: 'number' }],
            description: 'Property with anyOf but no direct type',
          },
          withEnum: {
            enum: ['one', 'two', 'three'],
            description: 'Property with enum but no type',
          },
        },
      };

      const zodSchema = jsonSchemaToZod(schema);

      // Test property with type
      expect(zodSchema.parse({ withType: 'test' })).toEqual({
        withType: 'test',
        withoutType: 'default value',
      });
      expect(() => zodSchema.parse({ withType: 123 })).toThrow();

      // Test property without type (should accept any value)
      expect(zodSchema.parse({ withoutType: 'string value' })).toEqual({
        withoutType: 'string value', // Override default
      });
      expect(zodSchema.parse({ withoutType: 123 })).toEqual({
        withoutType: 123, // Override default
      });
      expect(zodSchema.parse({ withoutType: { nested: true } })).toEqual({
        withoutType: { nested: true }, // Override default
      });

      // Test property with anyOf but no direct type
      expect(zodSchema.parse({ withAnyOf: 'string value' })).toEqual({
        withAnyOf: 'string value',
        withoutType: 'default value', // Default value is included
      });
      expect(zodSchema.parse({ withAnyOf: 123 })).toEqual({
        withAnyOf: 123,
        withoutType: 'default value', // Default value is included
      });
      expect(() => zodSchema.parse({ withAnyOf: true })).toThrow();

      // Test property with enum but no type
      expect(zodSchema.parse({ withEnum: 'one' })).toEqual({
        withEnum: 'one',
        withoutType: 'default value', // Default value is included
      });
      expect(() => zodSchema.parse({ withEnum: 'invalid' })).toThrow();

      // Test that default value is included when property is missing
      expect(zodSchema.parse({})).toEqual({
        withoutType: 'default value',
      });
    });

    it('should handle default values', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            default: 'Anonymous',
          },
          settings: {
            type: 'object',
            default: { theme: 'light' },
            properties: {
              theme: {
                type: 'string',
              },
            },
          },
        },
      };

      const zodSchema = jsonSchemaToZod(schema);

      // Test default values for top-level property
      expect(zodSchema.parse({})).toEqual({
        name: 'Anonymous',
        settings: { theme: 'light' },
      });

      // Test that defaults don't override provided values
      expect(
        zodSchema.parse({
          name: 'John',
          settings: {
            theme: 'dark',
          },
        })
      ).toEqual({
        name: 'John',
        settings: {
          theme: 'dark',
        },
      });
    });

    it('should handle default null values', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name field',
          },
          status: {
            type: 'string',
            default: null,
            description: 'A field with default null',
          },
          age: {
            type: 'number',
            description: 'Age field without default',
          },
        },
        required: ['name'],
      };

      const zodSchema = jsonSchemaToZod(schema);

      // Test with required field only - should include null default
      expect(zodSchema.parse({ name: 'John' })).toEqual({
        name: 'John',
        status: null,
      });

      // Test with status explicitly set to null
      expect(zodSchema.parse({ name: 'John', status: null })).toEqual({
        name: 'John',
        status: null,
      });

      // Test with status set to a string value
      expect(zodSchema.parse({ name: 'John', status: 'active' })).toEqual({
        name: 'John',
        status: 'active',
      });

      // Test that required field validation still works
      expect(() => zodSchema.parse({})).toThrow();
    });

    it('should transform GetUserRequest schema correctly', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'The username of the Hacker News user to retrieve.',
            title: 'Username',
          },
        },
        required: ['username'],
        title: 'GetUserRequest',
      };

      const zodSchema = jsonSchemaToZod(schema);

      // Test schema description/title
      expect(zodSchema.description).toBe('GetUserRequest');

      // Test required field validation
      expect(() => zodSchema.parse({})).toThrow();
      expect(() => zodSchema.parse({ username: 123 })).toThrow();

      // Test valid data
      expect(zodSchema.parse({ username: 'testuser' })).toEqual({
        username: 'testuser',
      });

      // Test property description
      const shape = (zodSchema as any)._def.shape();
      expect(shape.username.description).toBe('The username of the Hacker News user to retrieve.');
    });

    it('should append example to description', () => {
      const schema: JsonSchema = {
        type: 'string',
        description: 'User name',
        example: 'john_doe',
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('User name\nExample: "john_doe"');
    });

    it('should handle example without description', () => {
      const schema: JsonSchema = {
        type: 'number',
        example: 42,
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('Example: 42');
    });

    it('should handle example with title but no description', () => {
      const schema: JsonSchema = {
        type: 'object',
        title: 'User Object',
        example: { name: 'John', age: 30 },
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('User Object\nExample: {"name":"John","age":30}');
    });

    it('should handle single example in examples array', () => {
      const schema: JsonSchema = {
        type: 'string',
        description: 'Property name',
        examples: ['lifecyclestage'],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('Property name\nExample: "lifecyclestage"');
    });

    it('should handle multiple examples in examples array', () => {
      const schema: JsonSchema = {
        type: 'array',
        description: 'List of property names',
        examples: ["['lifecyclestage', 'hs_lead_status']", "['hubspot_owner_id']"],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe(
        "List of property names\nExamples:\n  \"['lifecyclestage', 'hs_lead_status']\"\n  \"['hubspot_owner_id']\""
      );
    });

    it('should prioritize example over examples', () => {
      const schema: JsonSchema = {
        type: 'string',
        description: 'Property name',
        example: 'single_example',
        examples: ['example1', 'example2'],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('Property name\nExample: "single_example"');
    });

    it('should handle empty examples array', () => {
      const schema: JsonSchema = {
        type: 'string',
        description: 'Property name',
        examples: [],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('Property name');
    });

    it('should preserve array structure in examples', () => {
      const schema: JsonSchema = {
        type: 'array',
        description: 'Property combinations',
        examples: [
          ['lifecyclestage', 'hs_lead_status'],
          ['hubspot_owner_id'],
          ['created_date', 'modified_date', 'status'],
        ],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe(
        'Property combinations\nExamples:\n  ["lifecyclestage","hs_lead_status"]\n  ["hubspot_owner_id"]\n  ["created_date","modified_date","status"]'
      );
    });

    it('should handle primitive types in examples array', () => {
      const schema: JsonSchema = {
        type: 'string',
        description: 'Status values',
        examples: ['active', 'inactive', 'pending'],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe(
        'Status values\nExamples:\n  "active"\n  "inactive"\n  "pending"'
      );
    });

    it('should handle mixed primitive types in examples array', () => {
      const schema: JsonSchema = {
        type: 'number',
        description: 'Various numbers',
        examples: [42, 3.14, 0, -5],
      } as any;
      const zodSchema = jsonSchemaToZod(schema);
      expect(zodSchema.description).toBe('Various numbers\nExamples:\n  42\n  3.14\n  0\n  -5');
    });
  });
});
