import { describe, it, expect } from 'vitest';
import { omitNullToolArguments, toStrictJsonSchema } from '../../src/utils/jsonSchema';
import type { StrictSchemaChange } from '../../src/utils/jsonSchema';

const propertyOf = (schema: Record<string, unknown>, name: string): Record<string, unknown> =>
  (schema.properties as Record<string, Record<string, unknown>>)[name];

const reasons = (changes: StrictSchemaChange[]): string[] => changes.map(change => change.reason);

/** Structural invariants OpenAI enforces on every node of a strict schema. */
function assertStrictShape(node: unknown, path = ''): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => assertStrictShape(item, `${path}[${index}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.anyOf !== undefined) {
    expect(record.type, `${path}: type beside anyOf`).toBeUndefined();
  }
  expect(record.default, `${path}: default`).toBeUndefined();
  expect(record.examples, `${path}: examples`).toBeUndefined();
  expect(record.oneOf, `${path}: oneOf`).toBeUndefined();
  expect(record.patternProperties, `${path}: patternProperties`).toBeUndefined();
  const isObject =
    record.type === 'object' || (Array.isArray(record.type) && record.type.includes('object'));
  if (isObject || record.properties !== undefined) {
    const properties = (record.properties ?? {}) as Record<string, unknown>;
    expect(record.required, `${path}: required`).toEqual(Object.keys(properties));
    expect(record.additionalProperties, `${path}: additionalProperties`).toBe(false);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'enum' || key === 'const') continue;
    assertStrictShape(child, path ? `${path}.${key}` : key);
  }
}

describe('toStrictJsonSchema', () => {
  it('keeps an already-flat all-required object valid', () => {
    const input = {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    };

    const { schema, changes } = toStrictJsonSchema(input);

    expect(schema).toEqual(input);
    expect(changes).toEqual([]);
  });

  it('keeps optional properties, requires them and widens them to accept null', () => {
    const { schema, changes } = toStrictJsonSchema({
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            note: { type: 'string', description: 'optional note' },
          },
          required: ['url'],
        },
      },
      required: ['cfg'],
    });

    expect(schema).toEqual({
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            note: { type: ['string', 'null'], description: 'optional note' },
          },
          required: ['url', 'note'],
          additionalProperties: false,
        },
      },
      required: ['cfg'],
      additionalProperties: false,
    });
    expect(changes).toEqual([
      {
        path: 'properties.cfg.properties.note',
        reason: 'optional-property-nullable',
        detail: 'property "note" is now required and accepts null',
      },
    ]);
  });

  it('requires and widens every property when the object has no required array', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
    });

    expect(schema).toEqual({
      type: 'object',
      properties: {
        a: { type: ['string', 'null'] },
        b: { type: ['number', 'null'] },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    });
  });

  it('keeps nullable type arrays as-is and closes nullable objects', () => {
    const { schema, changes } = toStrictJsonSchema({
      type: 'object',
      properties: {
        id: { type: ['string', 'null'], description: 'identifier' },
        cfg: {
          type: ['object', 'null'],
          properties: { a: { type: 'string' } },
          required: ['a'],
        },
        xs: { type: ['array', 'null'], items: { type: 'string' } },
      },
      required: ['id', 'cfg', 'xs'],
    });

    expect(schema).toEqual({
      type: 'object',
      properties: {
        id: { type: ['string', 'null'], description: 'identifier' },
        cfg: {
          type: ['object', 'null'],
          properties: { a: { type: 'string' } },
          required: ['a'],
          additionalProperties: false,
        },
        xs: { type: ['array', 'null'], items: { type: 'string' } },
      },
      required: ['id', 'cfg', 'xs'],
      additionalProperties: false,
    });
    expect(changes).toEqual([]);
    assertStrictShape(schema);
  });

  it('widens optional composition and enum-only properties without placing type beside anyOf', () => {
    const { schema } = toStrictJsonSchema({
      type: 'object',
      properties: {
        value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        already: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        choice: { enum: ['a', 'b'], description: 'pick one' },
        multi: { type: ['string', 'number'] },
      },
    });

    expect(propertyOf(schema, 'value')).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
    });
    expect(propertyOf(schema, 'already')).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
    expect(propertyOf(schema, 'choice')).toEqual({
      description: 'pick one',
      anyOf: [{ enum: ['a', 'b'] }, { type: 'null' }],
    });
    expect(propertyOf(schema, 'multi')).toEqual({ type: ['string', 'number', 'null'] });
    assertStrictShape(schema);
  });

  it('normalizes composition branches and array items recursively', () => {
    const { schema, changes } = toStrictJsonSchema({
      type: 'object',
      properties: {
        payload: {
          anyOf: [
            {
              type: 'object',
              properties: { inner: { type: 'string' }, extra: { type: 'string' } },
              required: ['inner'],
            },
            { type: 'null' },
          ],
        },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, tag: { type: 'string' } },
            required: ['id'],
          },
        },
        either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['payload', 'rows', 'either'],
    });

    expect((propertyOf(schema, 'payload').anyOf as unknown[])[0]).toEqual({
      type: 'object',
      properties: { inner: { type: 'string' }, extra: { type: ['string', 'null'] } },
      required: ['inner', 'extra'],
      additionalProperties: false,
    });
    expect(propertyOf(schema, 'rows').items).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, tag: { type: ['string', 'null'] } },
      required: ['id', 'tag'],
      additionalProperties: false,
    });
    expect(propertyOf(schema, 'either')).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
    expect(reasons(changes)).toContain('one-of-converted');
    assertStrictShape(schema);
  });

  it('reports dynamic-key and free-form objects as unsupported instead of closing them', () => {
    const { schema, unsupported } = toStrictJsonSchema({
      type: 'object',
      properties: {
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        meta: { type: 'object', description: 'any json' },
        tagged: { type: 'object', patternProperties: { '^x-': { type: 'string' } } },
        open: { type: 'object', additionalProperties: true },
      },
      required: ['headers', 'meta', 'tagged', 'open'],
    });

    expect(unsupported).toEqual([
      {
        path: 'properties.headers',
        keyword: 'additionalProperties',
        detail: 'object accepts arbitrary keys',
      },
      {
        path: 'properties.meta',
        keyword: 'properties',
        detail: 'free-form object accepts arbitrary keys',
      },
      {
        path: 'properties.tagged',
        keyword: 'patternProperties',
        detail: 'object accepts pattern-matched keys',
      },
      {
        path: 'properties.open',
        keyword: 'additionalProperties',
        detail: 'object accepts arbitrary keys',
      },
    ]);
    // The schema-valued additionalProperties is preserved, not overwritten.
    expect(propertyOf(schema, 'headers').additionalProperties).toEqual({ type: 'string' });
    expect(propertyOf(schema, 'tagged').patternProperties).toBeDefined();
  });

  it('strips annotation keywords and reports keywords it cannot rewrite', () => {
    const { schema, changes, unsupported } = toStrictJsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', examples: ['a'], default: 'x' },
        pair: { type: 'array', prefixItems: [{ type: 'number' }] },
        all: { allOf: [{ type: 'string' }] },
      },
      required: ['name', 'pair', 'all'],
    });

    expect(propertyOf(schema, 'name')).toEqual({ type: 'string' });
    expect(changes.filter(change => change.reason === 'unsupported-keyword-stripped')).toHaveLength(
      2
    );
    expect(unsupported.map(entry => [entry.path, entry.keyword])).toEqual([
      ['properties.pair', 'prefixItems'],
      ['properties.all', 'allOf'],
    ]);
  });

  it('inlines $ref/$defs, dedupes required and reports dangling refs', () => {
    const { schema, changes, unsupported } = toStrictJsonSchema({
      type: 'object',
      properties: {
        cfg: { $ref: '#/$defs/Config' },
        missing: { $ref: '#/$defs/Nope' },
      },
      required: ['cfg', 'cfg', 'missing'],
      $defs: {
        Config: {
          type: 'object',
          properties: { url: { type: 'string' }, note: { type: 'string' } },
          required: ['url'],
        },
      },
    });

    expect(JSON.stringify(schema)).not.toContain('$ref');
    expect(schema.$defs).toBeUndefined();
    expect(propertyOf(schema, 'cfg')).toEqual({
      type: 'object',
      properties: { url: { type: 'string' }, note: { type: ['string', 'null'] } },
      required: ['url', 'note'],
      additionalProperties: false,
    });
    expect(schema.required).toEqual(['cfg', 'missing']);
    expect(unsupported).toEqual([
      { path: '', keyword: '$ref', detail: 'unresolved $ref "#/$defs/Nope"' },
      {
        path: 'properties.missing',
        keyword: 'additionalProperties',
        detail: 'object accepts arbitrary keys',
      },
    ]);
    expect(changes).toContainEqual(
      expect.objectContaining({
        path: 'properties.cfg.properties.note',
        reason: 'optional-property-nullable',
      })
    );
  });

  it('caps the change log at 50 entries without losing properties', () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) properties[`p${i}`] = { type: 'string' };

    const { schema, changes, totalChanges } = toStrictJsonSchema({
      type: 'object',
      properties,
      required: ['p0'],
    });

    expect(Object.keys(schema.properties as object)).toHaveLength(60);
    expect(changes).toHaveLength(50);
    expect(totalChanges).toBe(59);
  });

  it('does not mutate the input schema', () => {
    const input = {
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          properties: { opt: { type: 'string', default: 1 } },
        },
      },
      required: ['cfg'],
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    toStrictJsonSchema(input);

    expect(input).toEqual(snapshot);
  });

  it('is idempotent', () => {
    const once = toStrictJsonSchema({
      type: 'object',
      properties: {
        cfg: { $ref: '#/$defs/Config' },
        id: { type: ['string', 'null'] },
      },
      $defs: {
        Config: {
          type: 'object',
          properties: { url: { type: 'string' }, note: { type: 'string' } },
          required: ['url'],
        },
      },
    }).schema;

    const twice = toStrictJsonSchema(once);
    expect(twice.schema).toEqual(once);
    expect(twice.changes).toEqual([]);
    expect(twice.unsupported).toEqual([]);
  });

  it('reports non-object and cyclic roots as unsupported', () => {
    expect(toStrictJsonSchema({ type: 'string' }).unsupported).toEqual([
      { path: '', keyword: 'type', detail: 'root must be a non-nullable object' },
    ]);
    expect(
      toStrictJsonSchema({ type: ['object', 'null'], properties: { a: { type: 'string' } } })
        .unsupported
    ).toContainEqual(expect.objectContaining({ path: '', keyword: 'type' }));

    const cyclic = toStrictJsonSchema({
      type: 'object',
      properties: { node: { $ref: '#/$defs/Node' } },
      required: ['node'],
      $defs: {
        Node: {
          type: 'object',
          properties: { child: { $ref: '#/$defs/Node' } },
          required: ['child'],
        },
      },
    });
    // The cycle-break sentinel is a free-form object, which strict mode cannot express.
    expect(cyclic.unsupported).toContainEqual(
      expect.objectContaining({ keyword: 'additionalProperties' })
    );
  });

  it('throws past the maximum nesting depth', () => {
    let deep: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 600; i++) {
      deep = { type: 'object', properties: { nest: deep }, required: ['nest'] };
    }

    expect(() => toStrictJsonSchema(deep)).toThrow(/depth/);
  });
});

describe('omitNullToolArguments', () => {
  const schema = {
    type: 'object',
    properties: {
      cfg: {
        type: 'object',
        properties: { url: { type: 'string' }, note: { type: 'string' } },
        required: ['url'],
      },
      label: { type: 'string' },
      clearable: { type: ['string', 'null'] },
      choice: { anyOf: [{ enum: ['a'] }, { type: 'null' }] },
      rows: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' }, tag: { type: 'string' } } },
      },
    },
  };

  it('drops nulls the schema does not accept and keeps the ones it does', () => {
    const input = {
      cfg: { url: 'https://example.com', note: null },
      label: null,
      clearable: null,
      choice: null,
      unknown: null,
      rows: [{ id: '1', tag: null }, null],
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    expect(omitNullToolArguments(input, schema)).toEqual({
      cfg: { url: 'https://example.com' },
      clearable: null,
      choice: null,
      unknown: null,
      rows: [{ id: '1' }, null],
    });
    expect(input).toEqual(snapshot);
  });
});
