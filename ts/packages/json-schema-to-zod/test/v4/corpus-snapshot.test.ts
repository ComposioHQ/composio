/**
 * The JSON Schema the v4 builder renders for the shared corpus, as the
 * review artifact for moving core and the providers onto it.
 */
import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';

import { jsonSchemaToZod } from '../../src/v4';
import type { JsonSchema } from '../../src/types';
import { loadObjectCases } from '../fixtures/corpus';

describe('v4 JSON Schema of the shared corpus', () => {
  it('matches the pinned snapshot', () => {
    const cases = loadObjectCases().map(({ id, schema }) => ({
      id,
      jsonSchema: z4.toJSONSchema(jsonSchemaToZod(schema as JsonSchema), {
        io: 'input',
        target: 'draft-7',
      }),
    }));
    expect(cases).toMatchSnapshot();
  });
});
