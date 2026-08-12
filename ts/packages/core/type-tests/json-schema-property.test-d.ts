import type { JSONSchemaProperty, Tool } from '../src';

const recursiveSchema: JSONSchemaProperty = {
  type: 'object',
  properties: {
    filters: {
      anyOf: [
        { type: 'string', enum: ['active', 'archived'] },
        {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
        },
      ],
    },
  },
  additionalProperties: false,
  default: { filters: 'active' },
  'x-composio-metadata': { source: 'type-test' },
};

const defaultValue: unknown = recursiveSchema.default;
void defaultValue;

declare const tool: Tool;
const inputProperties: Record<string, JSONSchemaProperty> | undefined =
  tool.inputParameters?.properties;
void inputProperties;

// @ts-expect-error known JSON Schema keywords keep their concrete types
const invalidType: JSONSchemaProperty = { type: 'date' };
void invalidType;

// @ts-expect-error recursive properties must contain JSON Schema nodes
const invalidProperty: JSONSchemaProperty = { properties: { query: 'string' } };
void invalidProperty;
