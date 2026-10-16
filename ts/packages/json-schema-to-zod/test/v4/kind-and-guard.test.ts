import { interopZodObjectStrict } from '@langchain/core/utils/types';
import { afterEach, describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';

import { jsonSchemaToZod, jsonSchemaToZodShape } from '../../src/v4';
import type { JsonSchema } from '../../src/types';

const guarded: JsonSchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    limit: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
  },
  required: ['q'],
};

const rejects = (schema: z4.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues;
};

describe('v4 kind and guard survival', () => {
  afterEach(() => {
    z4.config({ jitless: false });
  });

  it('keeps a guarded object root a ZodObject with its shape', () => {
    const parsed = jsonSchemaToZod(guarded);
    expect(parsed).toBeInstanceOf(z4.ZodObject);
    expect(Object.keys((parsed as z4.ZodObject).shape)).toEqual(['q', 'limit']);
    expect(parsed.safeParse({ q: 'cats', limit: null }).success).toBe(true);
    rejects(parsed, { q: 'cats', limit: 'ten' });
  });

  it('keeps the guard through describe, meta, and a definition clone', () => {
    const parsed = jsonSchemaToZod({ ...guarded, description: 'Search' }) as z4.ZodObject;
    const copies: z4.ZodType[] = [
      parsed.describe('Renamed'),
      parsed.meta({ title: 'Search' }),
      z4.core.clone(parsed, { ...parsed.def }),
      z4.core.clone(parsed, { ...parsed.def, catchall: z4.never() }),
    ];
    for (const copy of copies) {
      expect(copy).toBeInstanceOf(z4.ZodObject);
      rejects(copy, { q: 'cats', limit: 'ten' });
      expect(copy.safeParse({ q: 'cats' }).success).toBe(true);
    }
    expect(copies[0].description).toBe('Renamed');
    expect(copies[1].description).toBe('Search');
    expect(copies[1].meta()?.title).toBe('Search');
  });

  it('keeps the guard through the LangChain strict clone', () => {
    const parsed = jsonSchemaToZod(guarded) as z4.ZodObject;
    const strict = interopZodObjectStrict(parsed, true) as unknown as z4.ZodType;
    expect(strict).toBeInstanceOf(z4.ZodObject);
    rejects(strict, { q: 'cats', limit: 'ten' });
    rejects(strict, { q: 'cats', extra: 1 });
    expect(strict.safeParse({ q: 'cats' }).success).toBe(true);
  });

  it.each([{ jitless: true }, { jitless: false }])(
    'runs a guarded property under the object parser with jitless $jitless',
    ({ jitless }) => {
      z4.config({ jitless });
      // A raw shape guards each property on its own, so the enclosing object
      // is the plain `z.object()` a framework builds and the guard runs from
      // inside its property loop.
      const shape = jsonSchemaToZodShape({
        type: 'object',
        properties: {
          handle: { $ref: '#/$defs/handle' },
          count: { type: 'integer' },
        },
        $defs: { handle: { type: 'string', pattern: '^[a-z]+$' } },
      });
      const parsed = z4.object(shape);
      for (let round = 0; round < 3; round++) {
        expect(parsed.safeParse({ handle: 'ok', count: 1 }).success).toBe(true);
        const issues = rejects(parsed, { handle: 'NO', count: 1 });
        expect(issues.map(issue => [issue.code, issue.path])).toEqual([['custom', ['handle']]]);
      }
    }
  );

  it('reports exactly one issue when the guard fails', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      properties: { x: { type: 'string', default: 'generated' } },
      required: ['x'],
    });
    const issues = rejects(parsed, {});
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('custom');
    expect(issues[0].path).toEqual([]);
  });

  it('keeps a nested guard when the parent object is cloned', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      properties: { ref: { $ref: '#/$defs/n' } },
      $defs: { n: { type: 'number', minimum: 1 } },
    }) as z4.ZodObject;
    const extended = parsed.extend({ more: z4.string().optional() });
    rejects(extended, { ref: 0 });
    expect(extended.safeParse({ ref: 2, more: 'x' }).success).toBe(true);
  });

  it('does not fire the guard when zod runs the schema backward', () => {
    const parsed = jsonSchemaToZod(guarded);
    const forward = rejects(parsed, { q: 'cats', limit: 'ten' });
    expect(forward.some(issue => issue.code === 'custom')).toBe(true);

    // `.safeEncode()` runs zod's parse with direction `backward`. The
    // whole-schema guard steps aside on that axis; the schema's own checks
    // still reject the value, without the guard's custom issue on top.
    const backward = parsed.safeEncode({ q: 'cats', limit: 'ten' });
    expect(backward.success).toBe(false);
    const issues = backward.success ? [] : backward.error.issues;
    expect(issues.some(issue => issue.code === 'custom')).toBe(false);
  });
});
