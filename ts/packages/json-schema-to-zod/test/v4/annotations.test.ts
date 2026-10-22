import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';

import { jsonSchemaToZod } from '../../src/v4';
import { zodV4Backend } from '../../src/backend/zod-v4';
import type { JsonSchema } from '../../src/types';

type Json = Record<string, unknown>;

const render = (schema: JsonSchema, io: 'input' | 'output' = 'input'): Json =>
  z4.toJSONSchema(jsonSchemaToZod(schema), { io, target: 'draft-7' }) as Json;

const property = (json: Json, key: string): Json => (json.properties as Record<string, Json>)[key];

const ajv = new Ajv({ strict: false, validateFormats: false });

describe('v4 annotation forwarding', () => {
  it.each(['input', 'output'] as const)(
    'keeps the source format, encoding, and media type (io %s)',
    io => {
      const json = render(
        {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary' },
            hex: { type: 'string', contentEncoding: 'base16' },
            image: { type: 'string', contentEncoding: 'BASE64', contentMediaType: 'image/png' },
            at: { type: 'string', format: 'time' },
            big: { type: 'number', format: 'int64' },
            when: { type: 'string', format: 'date-time', description: 'When' },
          },
        },
        io
      );
      expect(property(json, 'file')).toEqual({ type: 'string', format: 'binary' });
      expect(property(json, 'hex')).toEqual({ type: 'string', contentEncoding: 'base16' });
      expect(property(json, 'image')).toMatchObject({
        type: 'string',
        contentEncoding: 'BASE64',
        contentMediaType: 'image/png',
      });
      // zod adds its own `pattern` for the ISO formats; the source `format` rides along.
      expect(property(json, 'at')).toMatchObject({ type: 'string', format: 'time' });
      expect(property(json, 'big')).toEqual({ type: 'integer', format: 'int64' });
      expect(property(json, 'when')).toMatchObject({
        type: 'string',
        format: 'date-time',
        description: 'When',
      });
    }
  );

  it('forwards annotations on nested properties and under a guarded root', () => {
    const json = render({
      type: 'object',
      properties: {
        inner: {
          type: 'object',
          properties: { blob: { type: 'string', format: 'binary' } },
        },
        linked: { $ref: '#/$defs/count' },
        total: { type: 'integer' },
      },
      $defs: { count: { type: 'integer' } },
    });
    expect(property(property(json, 'inner'), 'blob')).toEqual({ type: 'string', format: 'binary' });
    expect(property(json, 'total')).toEqual({ type: 'integer' });
  });

  it('leaves the annotations out with withoutAnnotations', () => {
    const json = z4.toJSONSchema(
      jsonSchemaToZod(
        {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary', description: 'A file' },
            count: { type: 'integer' },
          },
        },
        { withoutAnnotations: true }
      ),
      { io: 'input', target: 'draft-7' }
    ) as Json;
    expect(property(json, 'file')).toEqual({ type: 'string', description: 'A file' });
    expect(property(json, 'count')).toEqual({ type: 'number' });
  });

  it.each([
    {
      name: 'a nullable integer',
      schema: { type: 'integer', nullable: true, description: 'N' },
      accepted: 7,
      rejected: 7.5,
    },
    {
      name: 'a nullable date-time',
      schema: { type: 'string', format: 'date-time', nullable: true, description: 'D' },
      accepted: '2024-03-20T12:00:00Z',
      rejected: 12,
    },
  ])('keeps $name nullable in the rendered schema', ({ schema, accepted, rejected }) => {
    const converted = jsonSchemaToZod(schema as unknown as JsonSchema);
    const json = z4.toJSONSchema(converted, { io: 'input', target: 'draft-7' }) as Json;
    // The annotations sit on the inner node: a scalar `type` or `format`
    // next to the wrapper's own rendering would reject `null`. zod 4.5
    // folds `anyOf: [inner, null]` into a type array when the inner node
    // carries only a `type`; 4.1 keeps the `anyOf`.
    expect(typeof json.type).not.toBe('string');
    expect(json).not.toHaveProperty('format');
    expect(json.description).toBe(schema.description);
    expect(converted.description).toBe(schema.description);
    const { $schema: _schema, ...plain } = json;
    const validate = ajv.compile(plain);
    expect(validate(null)).toBe(true);
    expect(validate(accepted)).toBe(true);
    expect(validate(rejected)).toBe(false);
    expect(converted.safeParse(null).success).toBe(true);
    expect(converted.safeParse(accepted).success).toBe(true);
    expect(converted.safeParse(rejected).success).toBe(false);
  });

  it('keeps type integer next to bounds', () => {
    const json = render({ type: 'integer', minimum: 1, maximum: 10 });
    expect(json).toMatchObject({ type: 'integer', minimum: 1, maximum: 10 });
    expect(render({ type: 'number', multipleOf: 1 })).toMatchObject({ type: 'integer' });
  });

  it('forwards annotations on a constrained value', () => {
    const json = render({ type: 'string', enum: ['a', 'b'], format: 'custom', description: 'E' });
    expect(json.format).toBe('custom');
    expect(json.description).toBe('E');
  });

  it('forwards nothing from the keywords next to a $ref', () => {
    const schema: JsonSchema = {
      type: 'object',
      $defs: { text: { type: 'string' } },
      properties: {
        x: { $ref: '#/$defs/text', type: 'integer', format: 'int64', contentEncoding: 'base64' },
      },
      required: ['x'],
    };
    expect(jsonSchemaToZod(schema).safeParse({ x: 'hi' }).success).toBe(true);
    expect(property(render(schema), 'x')).toEqual({});
  });

  it('writes the description together with the annotations', () => {
    const converted = jsonSchemaToZod({ type: 'string', format: 'binary', description: 'Bytes' });
    expect(converted.description).toBe('Bytes');
    expect(converted.meta()).toEqual({ description: 'Bytes', format: 'binary' });
  });
});

describe('v4 decorate across wrapper kinds', () => {
  /** Every wrapper kind `annotateInnermost` can receive, built through the backend itself. */
  it.each([
    ['optional', (inner: z4.ZodString) => zodV4Backend.optional(inner)],
    ['nullable', (inner: z4.ZodString) => zodV4Backend.nullable(inner)],
    ['prefault', (inner: z4.ZodString) => zodV4Backend.withDefault(inner, 'fallback')],
    ['readonly', (inner: z4.ZodString) => zodV4Backend.readonly(inner)],
  ] as const)(
    'puts forwarded annotations on the innermost node under a %s wrapper',
    (_name, make) => {
      const inner = z4.string();
      const decorated = zodV4Backend.decorate(make(inner).meta({ title: 'Wrapper' }), {
        annotations: { format: 'binary' },
      });

      // A validation-shaped annotation on the wrapper would sit beside the
      // wrapper's own rendering (`anyOf`, `default`, `readOnly`) and change
      // what the schema accepts; it must land on the innermost node.
      let deepest = decorated;
      for (;;) {
        const def = (deepest as unknown as { _zod: { def: { innerType?: z4.ZodType } } })._zod.def;
        if (!def.innerType) break;
        deepest = def.innerType;
      }
      expect(z4.globalRegistry.get(deepest)).toMatchObject({ format: 'binary' });
      // The wrapper keeps the metadata it already carried through the rewrap.
      expect(z4.globalRegistry.get(decorated)).toMatchObject({ title: 'Wrapper' });
      expect(decorated.safeParse('data').success).toBe(true);
    }
  );
});
