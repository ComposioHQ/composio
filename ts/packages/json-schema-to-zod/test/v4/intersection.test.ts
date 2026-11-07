import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';

import { jsonSchemaToZod as toV3 } from '../../src/index';
import { jsonSchemaToZod as toV4 } from '../../src/v4';
import type { JsonSchema } from '../../src/types';

describe('v4 intersections', () => {
  const conflicting: JsonSchema = {
    allOf: [
      { type: 'object', properties: { a: { type: 'string', default: 'left' } } },
      { type: 'object', properties: { a: { type: 'string', default: 'right' } } },
    ],
  };

  it('reports a failure instead of throwing when the branches cannot merge', () => {
    expect(() =>
      z4.intersection(z4.any().prefault('left'), z4.any().prefault('right')).safeParse(undefined)
    ).toThrow('Unmergable intersection');
    expect(toV3(conflicting).safeParse({}).success).toBe(false);
    const result = toV4(conflicting).safeParse({});
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map(issue => issue.code)).toEqual(['custom']);
  });

  it('keeps the failure through a described clone', () => {
    expect(toV4(conflicting).describe('conflict').safeParse({}).success).toBe(false);
    expect(toV4(conflicting).describe('conflict').safeParse({ a: 'same' }).success).toBe(true);
  });
});
