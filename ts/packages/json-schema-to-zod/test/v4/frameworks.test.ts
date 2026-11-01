import { zodSchema } from '@ai-sdk/provider-utils';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { describe, expect, it } from 'vitest';

import { jsonSchemaToZod } from '../../src/v4';
import type { JsonSchema } from '../../src/types';

type Json = Record<string, unknown>;

const tool: JsonSchema = {
  type: 'object',
  description: 'Upload',
  properties: {
    file: { type: 'string', format: 'binary', description: 'The bytes' },
    name: { type: 'string', default: 'upload.bin' },
    retries: { type: 'integer', minimum: 0 },
  },
  required: ['file'],
};

describe('v4 schemas in frameworks', () => {
  it('keeps the annotations through the AI SDK schema wrapper', () => {
    const json = zodSchema(jsonSchemaToZod(tool)).jsonSchema as Json;
    const properties = json.properties as Record<string, Json>;
    expect(json.description).toBe('Upload');
    expect(properties.file).toMatchObject({
      type: 'string',
      format: 'binary',
      description: 'The bytes',
    });
    expect(properties.name).toMatchObject({ type: 'string', default: 'upload.bin' });
    expect(properties.retries).toMatchObject({ type: 'integer', minimum: 0 });
    expect(json.required).toEqual(['file']);
  });

  it('renders the output side for LangChain, where defaulted fields are required', () => {
    const json = toJsonSchema(jsonSchemaToZod(tool)) as Json;
    const properties = json.properties as Record<string, Json>;
    expect(json.description).toBe('Upload');
    expect(properties.file).toMatchObject({ type: 'string', format: 'binary' });
    expect(properties.retries).toMatchObject({ type: 'integer', minimum: 0 });
    expect(properties.name).not.toHaveProperty('default');
    expect(json.required).toEqual(['file', 'name']);
  });
});
