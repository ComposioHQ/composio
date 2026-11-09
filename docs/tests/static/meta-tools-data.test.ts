import { describe, expect, test } from 'bun:test';
import { metaToolSchema } from '../../lib/meta-tools-data';

const tool = {
  slug: 'EXAMPLE_TOOL',
  name: 'example_tool',
  displayName: 'Example Tool',
  description: 'Example API description.',
  tags: [],
  inputParameters: {},
  responseSchema: {},
};

describe('meta-tool display model', () => {
  test('normalizes unrestricted JSON and absent schema fields before rendering', () => {
    const parsed = metaToolSchema.parse({
      ...tool,
      inputParameters: { properties: { body: { description: '**Any**\nJSON' } } },
    });
    expect(parsed.summary).toBe(tool.description);
    expect(parsed.inputParameters.properties.body).toEqual({
      typeLabel: 'any',
      description: 'Any JSON',
      defaultLabel: null,
      properties: {},
      required: [],
      enum: [],
    });
    expect(parsed.responseSchema.properties).toEqual({});
    expect(parsed.responseSchema.required).toEqual([]);
  });

  test('normalizes nested arrays and retains required item properties', () => {
    const parsed = metaToolSchema.parse({
      ...tool,
      inputParameters: {
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'integer' } },
              },
            },
          },
          untyped_items: { type: 'array' },
          nullable: { type: ['string', 'null'] },
        },
      },
    });
    const { rows, untyped_items, nullable } = parsed.inputParameters.properties;
    expect(rows.typeLabel).toBe('array<array<object>>');
    expect(rows.items?.items?.required).toEqual(['id']);
    expect(rows.items?.items?.properties.id.typeLabel).toBe('integer');
    expect(untyped_items.typeLabel).toBe('array<any>');
    expect(nullable.typeLabel).toBe('string | null');
  });

  test('preserves falsy defaults and scalar enum values', () => {
    const parsed = metaToolSchema.parse({
      ...tool,
      inputParameters: {
        properties: {
          count: { type: 'integer', default: 0, enum: [0, 1] },
          enabled: { type: 'boolean', default: false, enum: [false, true] },
        },
      },
    });
    expect(parsed.inputParameters.properties.count.defaultLabel).toBe('0');
    expect(parsed.inputParameters.properties.count.enum).toEqual(['0', '1']);
    expect(parsed.inputParameters.properties.enabled.defaultLabel).toBe('false');
    expect(parsed.inputParameters.properties.enabled.enum).toEqual(['false', 'true']);
  });

  test.each([{ type: 'invalid' }, { type: 42 }, { required: true }, { items: 'invalid' }])(
    'rejects malformed schema fields instead of silently displaying any (%j)',
    parameter => {
      const result = metaToolSchema.safeParse({
        ...tool,
        inputParameters: { properties: { body: parameter } },
      });
      expect(result.success).toBe(false);
    }
  );
});
