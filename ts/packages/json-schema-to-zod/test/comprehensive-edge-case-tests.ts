import { jsonSchemaToZod } from '../src/json-schema-to-zod';
import zodToJsonSchema from 'zod-to-json-schema';
import type { JsonSchema } from '../src/types';

console.log('=== Testing Complex Schema Edge Cases ===\n');

// Test 1: Original anyOf schema (not from nullable conversion)
console.log('Test 1: Original anyOf with different types and defaults');
const originalAnyOfSchema: JsonSchema = {
  type: 'object',
  properties: {
    flexible_field: {
      anyOf: [
        {
          type: 'string',
          minLength: 5,
          default: 'hello', // This should be preserved
        },
        {
          type: 'number',
          minimum: 0,
          default: 42, // This should be preserved
        },
        {
          type: 'boolean',
          default: true, // This should be preserved
        },
      ],
      description: 'A field that can be string, number, or boolean',
      default: 'hello',
    },
    status: {
      anyOf: [
        {
          type: 'string',
          enum: ['active', 'inactive'],
          default: 'active',
        },
        {
          type: 'number',
          enum: [1, 0],
          default: 1,
        },
      ],
      default: 'active',
    },
  },
  required: [],
};

console.log('Original schema:');
console.log(JSON.stringify(originalAnyOfSchema, null, 2));

const zodSchema1 = jsonSchemaToZod(originalAnyOfSchema);
const backToJson1 = zodToJsonSchema(zodSchema1, { target: 'jsonSchema7' });

console.log('\nConverted back to JSON:');
console.log(JSON.stringify(backToJson1, null, 2));

console.log('\nTesting parsing:');
try {
  console.log('Empty object:', zodSchema1.parse({}));
  console.log('With string flexible_field:', zodSchema1.parse({ flexible_field: 'world' }));
  console.log('With number flexible_field:', zodSchema1.parse({ flexible_field: 123 }));
  console.log('With boolean flexible_field:', zodSchema1.parse({ flexible_field: false }));
} catch (error) {
  console.error('Parse error:', error);
}

console.log('\n' + '='.repeat(80) + '\n');

// Test 2: Array with different types (union types)
console.log('Test 2: Array with union of different types');
const arrayUnionSchema: JsonSchema = {
  type: 'object',
  properties: {
    mixed_items: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'string',
            pattern: '^[a-zA-Z]+$',
            default: 'text',
          },
          {
            type: 'number',
            multipleOf: 2,
            default: 10,
          },
          {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
            },
            required: ['id'],
            default: { id: 1, name: 'default' },
          },
        ],
      },
      default: ['text', 10, { id: 1, name: 'default' }],
      description: 'Array that can contain strings, numbers, or objects',
    },
    tags: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'string',
            enum: ['important', 'urgent', 'normal'],
            default: 'normal',
          },
          {
            type: 'number',
            minimum: 1,
            maximum: 5,
            default: 3,
          },
        ],
      },
      default: ['normal', 3],
      description: 'Tags can be priority strings or numeric ratings',
    },
  },
  required: [],
};

console.log('Original schema:');
console.log(JSON.stringify(arrayUnionSchema, null, 2));

const zodSchema2 = jsonSchemaToZod(arrayUnionSchema);
const backToJson2 = zodToJsonSchema(zodSchema2, { target: 'jsonSchema7' });

console.log('\nConverted back to JSON:');
console.log(JSON.stringify(backToJson2, null, 2));

console.log('\nTesting parsing:');
try {
  console.log('Empty object:', zodSchema2.parse({}));
  console.log(
    'With mixed array:',
    zodSchema2.parse({
      mixed_items: ['hello', 42, { id: 5, name: 'test' }],
      tags: ['urgent', 4, 'normal'],
    })
  );
} catch (error) {
  console.error('Parse error:', error);
}

console.log('\n' + '='.repeat(80) + '\n');

// Test 3: Complex nested schema with multiple anyOf and nullable fields
console.log('Test 3: Complex nested schema with anyOf and nullable');
const complexNestedSchema: JsonSchema = {
  type: 'object',
  properties: {
    user: {
      anyOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string', default: 'user-123' },
            name: { type: 'string' },
            email: {
              type: 'string',
              format: 'email',
              nullable: true,
              default: null,
            } as any,
          },
          required: ['name'],
          default: { id: 'user-123', name: 'Anonymous', email: null },
        },
        {
          type: 'string',
          pattern: '^user-\\d+$',
          default: 'user-000',
        },
      ],
      description: 'User can be an object or a user ID string',
      default: { id: 'user-123', name: 'Anonymous', email: null },
    },
    metadata: {
      type: 'object',
      properties: {
        settings: {
          anyOf: [
            {
              type: 'object',
              properties: {
                theme: {
                  type: 'string',
                  enum: ['light', 'dark'],
                  default: 'light',
                },
                notifications: {
                  type: 'boolean',
                  default: true,
                },
              },
              default: { theme: 'light', notifications: true },
            },
            {
              type: 'string',
              enum: ['minimal', 'full'],
              default: 'full',
            },
          ],
          default: { theme: 'light', notifications: true },
        },
        version: {
          type: 'string',
          nullable: true,
          default: null,
        } as any,
      },
      default: {
        settings: { theme: 'light', notifications: true },
        version: null,
      },
    },
  },
  required: [],
};

console.log('Original schema:');
console.log(JSON.stringify(complexNestedSchema, null, 2));

const zodSchema3 = jsonSchemaToZod(complexNestedSchema);
const backToJson3 = zodToJsonSchema(zodSchema3, { target: 'jsonSchema7' });

console.log('\nConverted back to JSON:');
console.log(JSON.stringify(backToJson3, null, 2));

console.log('\nTesting parsing:');
try {
  console.log('Empty object:', zodSchema3.parse({}));
  console.log(
    'With user object:',
    zodSchema3.parse({
      user: { name: 'John Doe', email: 'john@example.com' },
      metadata: {
        settings: 'minimal',
        version: '1.0.0',
      },
    })
  );
  console.log(
    'With user string:',
    zodSchema3.parse({
      user: 'user-456',
    })
  );
} catch (error) {
  console.error('Parse error:', error);
}
