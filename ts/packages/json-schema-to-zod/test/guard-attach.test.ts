import { describe, expect, it } from 'vitest';
import { version } from 'zod/v4/core';

import type { ZodBackend } from '../src/backend/types';
import { zodV3Backend } from '../src/backend/zod-v3';
import { zodV4Backend } from '../src/backend/zod-v4';
import { meetsZodV4Floor } from '../src/backend/zod-v4-floor';
import type { ParseContext } from '../src/context';
import { parseObjectShape } from '../src/parsers/parse-object-shape';
import type { JsonSchemaObject } from '../src/types';

/**
 * Counts how many whole-schema guards a shape parse attaches. A permissive
 * property ($ref, typeless constraints) gets its guard from the permissive
 * branch of `selectParser`, so the shape parser must not attach the identical
 * guard a second time; a whole-schema property that parses normally still
 * needs the property-level guard, and a plain property needs none.
 */
const countGuardAttachments = <S>(backend: ZodBackend<S>, schema: JsonSchemaObject): number => {
  let attachments = 0;
  const counting: ZodBackend<S> = {
    ...backend,
    attachGuard: (parsed, guard) => {
      attachments += 1;
      return backend.attachGuard(parsed, guard);
    },
  };
  const ctx: ParseContext<S> = {
    path: [],
    seen: new Map(),
    root: schema,
    backend: counting,
  };
  parseObjectShape(schema, ctx);
  return attachments;
};

/**
 * Whether a typeless `{ not: { type: 'string' } }` property, replaced by a
 * `parserOverride` with an unconstrained schema, accepts `value`. The override
 * skips the parser that would guard the property, so the shape parser must
 * still guard it.
 */
const overriddenPropertyAccepts = <S extends { safeParse(value: unknown): { success: boolean } }>(
  backend: ZodBackend<S>,
  value: unknown
): boolean => {
  const schema: JsonSchemaObject = { properties: { p: { not: { type: 'string' } } } };
  const shape = parseObjectShape(schema, {
    path: [],
    seen: new Map(),
    root: schema,
    backend,
    parserOverride: node => ('not' in node ? backend.any() : undefined),
  });
  return shape.p.safeParse(value).success;
};

const backends: ReadonlyArray<{
  name: string;
  attachmentsOf: (schema: JsonSchemaObject) => number;
  overrideAccepts: (value: unknown) => boolean;
}> = [
  {
    name: 'zod-v3',
    attachmentsOf: schema => countGuardAttachments(zodV3Backend, schema),
    overrideAccepts: value => overriddenPropertyAccepts(zodV3Backend, value),
  },
  // The `/v4` backend cannot load below the floor (an embedded zod 4.0.0 core
  // inside zod 3.25.x), so it joins only where the installed copy meets it.
  ...(meetsZodV4Floor(version)
    ? [
        {
          name: 'zod-v4',
          attachmentsOf: (schema: JsonSchemaObject) => countGuardAttachments(zodV4Backend, schema),
          overrideAccepts: (value: unknown) => overriddenPropertyAccepts(zodV4Backend, value),
        },
      ]
    : []),
];

describe.each(backends)('parseObjectShape guard attachments ($name)', ({ attachmentsOf }) => {
  it('attaches the guard once for a permissive $ref property', () => {
    const attachments = attachmentsOf({
      properties: { p: { $ref: '#/$defs/x' } },
      $defs: { x: { type: 'string' } },
    });
    expect(attachments).toBe(1);
  });

  it('attaches the guard once for a typeless permissive property', () => {
    const attachments = attachmentsOf({
      properties: { p: { properties: { a: { type: 'string' } } } },
    });
    expect(attachments).toBe(1);
  });

  it('attaches the guard once for a whole-schema property that parses normally', () => {
    const attachments = attachmentsOf({
      properties: { p: { type: 'array', uniqueItems: true } },
    });
    expect(attachments).toBe(1);
  });

  it('attaches no guard for a plain property', () => {
    const attachments = attachmentsOf({ properties: { p: { type: 'string' } } });
    expect(attachments).toBe(0);
  });
});

describe.each(backends)('parseObjectShape with a parserOverride ($name)', ({ overrideAccepts }) => {
  it('keeps the guard on a permissive property the override replaces', () => {
    expect(overrideAccepts('text')).toBe(false);
    expect(overrideAccepts(1)).toBe(true);
  });
});
