import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';

import { jsonSchemaToZod } from '../../src/v4';
import type { JsonSchema } from '../../src/types';
import { loadObjectCases, loadStrictCases } from '../fixtures/corpus';

const everyCase = [
  ...loadObjectCases().map(({ id, schema }) => ({ id: `object:${id}`, schema })),
  ...loadStrictCases().map(({ id, schema }) => ({ id: `strict:${id}`, schema })),
];

describe('v4 JSON Schema rendering', () => {
  describe.each(['input', 'output'] as const)('with io %s', io => {
    it.each(everyCase)('renders $id', ({ schema }) => {
      const converted = jsonSchemaToZod(schema as JsonSchema);
      expect(() => z4.toJSONSchema(converted, { io })).not.toThrow();
    });
  });
});
