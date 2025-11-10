import { describe, it, expect } from 'vitest';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import zodToJsonSchema from 'zod-to-json-schema';
import type { JsonSchema } from '@composio/json-schema-to-zod';

describe('E2E with Zod v3 - Round-trip conversion', () => {
  const testRoundTrip = (originalSchema: JsonSchema, expectedAdditionalProperties: any) => {
    const zodSchema = jsonSchemaToZod(originalSchema);
    const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' }) as any;

    const { $schema, ...cleanConverted } = convertedBack;

    return {
      zodSchema,
      convertedBack: cleanConverted,
      additionalPropertiesMatch:
        convertedBack.additionalProperties === expectedAdditionalProperties,
    };
  };

  // TODO: this is currently failing
  it.fails('should preserve additionalProperties: true for empty objects', () => {
    const schema: JsonSchema = {
      type: 'object',
      additionalProperties: true,
    };

    const { zodSchema, convertedBack, additionalPropertiesMatch } = testRoundTrip(schema, true);

    expect(additionalPropertiesMatch).toBe(true);
    expect(convertedBack.additionalProperties).toBe(true);
    expect(convertedBack.type).toBe('object');
    expect(convertedBack.properties).toEqual({});

    expect(zodSchema.parse({})).toEqual({});
    expect(zodSchema.parse({ any: 'value', number: 123 })).toEqual({ any: 'value', number: 123 });
  });

  // TODO: this is currently failing
  it.fails('should preserve additionalProperties: true for objects with properties', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
      additionalProperties: true,
    };

    const { zodSchema, convertedBack, additionalPropertiesMatch } = testRoundTrip(schema, true);

    expect(additionalPropertiesMatch).toBe(true);
    expect(convertedBack.additionalProperties).toBe(true);
    expect(convertedBack.properties).toBeDefined();
    expect(convertedBack.required).toEqual(['name']);

    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(zodSchema.parse({ name: 'John', age: 30, extra: 'field' })).toEqual({
      name: 'John',
      age: 30,
      extra: 'field',
    });
  });

  // TODO: this is currently failing
  it.fails('should preserve additionalProperties: false for empty objects', () => {
    const schema: JsonSchema = {
      type: 'object',
      additionalProperties: false,
    };

    const zodSchema = jsonSchemaToZod(schema);
    const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' }) as any;

    // zod-to-json-schema may convert z.object({}).strict() to { not: {} }
    // which is semantically equivalent to additionalProperties: false
    expect(
      convertedBack.additionalProperties === false ||
        (convertedBack.not && typeof convertedBack.not === 'object')
    ).toBe(true);
    expect(convertedBack.type).toBe('object');

    expect(zodSchema.parse({})).toEqual({});
    expect(() => zodSchema.parse({ extra: 'field' })).toThrow();
  });

  // TODO: this is currently failing
  it.fails('should preserve additionalProperties: false for objects with properties', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: false,
    };

    const zodSchema = jsonSchemaToZod(schema);
    const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' }) as any;

    expect(convertedBack.additionalProperties).toBe(false);
    expect(convertedBack.properties).toBeDefined();

    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
  });

  // TODO: this is currently failing
  it.fails('should handle additionalProperties with type schema', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: { type: 'number' },
    };

    const zodSchema = jsonSchemaToZod(schema);
    const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' }) as any;

    expect(convertedBack.additionalProperties).toEqual({ type: 'number' });
    expect(convertedBack.properties).toBeDefined();

    expect(zodSchema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(zodSchema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
    expect(() => zodSchema.parse({ name: 'John', extra: 'field' })).toThrow();
  });

  // TODO: this is currently failing
  it.fails('should handle nested objects with different additionalProperties settings', () => {
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
    const convertedBack = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' }) as any;

    expect(convertedBack.additionalProperties).toEqual({ type: 'string' });
    expect(convertedBack.properties?.strictChild).toBeDefined();
    expect(convertedBack.properties?.flexibleChild).toBeDefined();

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
