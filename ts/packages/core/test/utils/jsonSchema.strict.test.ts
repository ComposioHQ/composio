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

  it('keeps $defs and $ref, normalizes the definitions and reports dangling refs', () => {
    const { schema, changes, unsupported } = toStrictJsonSchema({
      type: 'object',
      properties: {
        cfg: { $ref: '#/$defs/Config' },
        optionalCfg: { $ref: '#/$defs/Config', description: 'optional' },
        missing: { $ref: '#/$defs/Nope' },
        external: { $ref: 'https://example.com/schema.json' },
      },
      required: ['cfg', 'cfg', 'missing', 'external'],
      $defs: {
        Config: {
          type: 'object',
          properties: { url: { type: 'string' }, note: { type: 'string' } },
          required: ['url'],
        },
      },
    });

    expect(propertyOf(schema, 'cfg')).toEqual({ $ref: '#/$defs/Config' });
    expect(propertyOf(schema, 'optionalCfg')).toEqual({
      description: 'optional',
      anyOf: [{ $ref: '#/$defs/Config' }, { type: 'null' }],
    });
    expect(schema.$defs).toEqual({
      Config: {
        type: 'object',
        properties: { url: { type: 'string' }, note: { type: ['string', 'null'] } },
        required: ['url', 'note'],
        additionalProperties: false,
      },
    });
    expect(schema.required).toEqual(['cfg', 'optionalCfg', 'missing', 'external']);
    expect(unsupported).toEqual([
      { path: 'properties.missing', keyword: '$ref', detail: 'unresolved $ref "#/$defs/Nope"' },
      {
        path: 'properties.external',
        keyword: '$ref',
        detail: 'unresolved $ref "https://example.com/schema.json"',
      },
    ]);
    expect(changes).toContainEqual(
      expect.objectContaining({
        path: '$defs.Config.properties.note',
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

  it('reports non-object roots as unsupported and keeps recursive $defs', () => {
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
          properties: { child: { $ref: '#/$defs/Node' }, label: { type: 'string' } },
          required: ['label'],
        },
      },
    });
    // Recursion through $defs is representable in strict mode.
    expect(cyclic.unsupported).toEqual([]);
    expect((cyclic.schema.$defs as Record<string, unknown>).Node).toEqual({
      type: 'object',
      properties: {
        child: { anyOf: [{ $ref: '#/$defs/Node' }, { type: 'null' }] },
        label: { type: 'string' },
      },
      required: ['child', 'label'],
      additionalProperties: false,
    });
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
      refd: { $ref: '#/$defs/Str' },
      refdNullable: { $ref: '#/$defs/NullableStr' },
    },
    $defs: { Str: { type: 'string' }, NullableStr: { type: ['string', 'null'] } },
  };

  it('drops nulls the schema does not accept and keeps the ones it does', () => {
    const input = {
      cfg: { url: 'https://example.com', note: null },
      label: null,
      clearable: null,
      choice: null,
      unknown: null,
      rows: [{ id: '1', tag: null }, null],
      refd: null,
      refdNullable: null,
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    expect(omitNullToolArguments(input, schema)).toEqual({
      cfg: { url: 'https://example.com' },
      clearable: null,
      choice: null,
      unknown: null,
      rows: [{ id: '1' }, null],
      refdNullable: null,
    });
    expect(input).toEqual(snapshot);
  });
});

describe('null acceptance', () => {
  const NULL_BRANCH = { type: 'null' };
  const DIRECTION = { enum: ['asc', null] };
  const wrapped = (schema: unknown) => ({ anyOf: [schema, NULL_BRANCH] });
  const toolSchema = (property: unknown, definitions: unknown = { Direction: DIRECTION }) => ({
    type: 'object',
    properties: { value: property },
    $defs: definitions,
  });

  it.each<[Record<string, unknown>, Record<string, unknown>]>([
    [{ type: 'string', enum: ['asc', 'desc'] }, wrapped({ type: 'string', enum: ['asc', 'desc'] })],
    [
      { type: ['string', 'null'], enum: ['asc', 'desc'] },
      wrapped({ type: ['string', 'null'], enum: ['asc', 'desc'] }),
    ],
    [{ type: 'string', const: 'asc' }, wrapped({ type: 'string', const: 'asc' })],
    [
      { type: 'integer', enum: [1, 2], description: 'page size' },
      { description: 'page size', ...wrapped({ type: 'integer', enum: [1, 2] }) },
    ],
    [
      { type: 'string', anyOf: [{ minLength: 1 }] },
      wrapped({ type: 'string', anyOf: [{ minLength: 1 }] }),
    ],
    [
      { enum: ['asc'], anyOf: [{ type: 'string' }, NULL_BRANCH] },
      wrapped({ enum: ['asc'], anyOf: [{ type: 'string' }, NULL_BRANCH] }),
    ],
    [
      { $ref: '#/$defs/Direction', type: 'string' },
      wrapped({ $ref: '#/$defs/Direction', type: 'string' }),
    ],
    // Already nullable: left alone.
    [
      { type: ['string', 'null'], enum: ['asc', null] },
      { type: ['string', 'null'], enum: ['asc', null] },
    ],
    [{ $ref: '#/$defs/Direction' }, { $ref: '#/$defs/Direction' }],
    [{ anyOf: [{ type: ['string', 'null'] }] }, { anyOf: [{ type: ['string', 'null'] }] }],
    // `type` or `anyOf` as the only obstacle: widened in place.
    [
      { type: 'string', minLength: 1 },
      { type: ['string', 'null'], minLength: 1 },
    ],
    [
      { anyOf: [{ type: 'string' }], description: 'd' },
      { anyOf: [{ type: 'string' }, NULL_BRANCH], description: 'd' },
    ],
  ])('widening keeps every constraint: %j', (property, expected) => {
    const source = toolSchema(property);
    const snapshot = structuredClone(source);
    const result = toStrictJsonSchema(source);

    expect(result.unsupported).toEqual([]);
    expect(propertyOf(result.schema, 'value')).toEqual(expected);
    expect(result.schema.required).toEqual(['value']);
    expect(source).toEqual(snapshot);
    const again = toStrictJsonSchema(result.schema);
    expect(again.schema).toEqual(result.schema);
    expect(again.changes).toEqual([]);
  });

  it.each<[unknown, boolean]>([
    [{ type: ['string', 'null'], enum: ['asc', 'desc'] }, false],
    [{ type: ['string', 'null'], const: 'asc' }, false],
    [{ type: ['string', 'null'], enum: ['asc', null] }, true],
    [{ type: ['string', 'null'], const: null }, true],
    [{ $ref: '#/$defs/Direction' }, true],
    [{ $ref: '#/$defs/Direction', type: 'string' }, false],
    [{ $ref: '#/$defs/Direction', enum: ['asc'] }, false],
    [{ $ref: '#/$defs/Missing' }, false],
    [{ $ref: 1 }, false],
    [{ allOf: [{ type: ['string', 'null'] }, { enum: ['asc'] }] }, false],
    [{ allOf: [{ type: ['string', 'null'] }, DIRECTION] }, true],
    [{ oneOf: [NULL_BRANCH, { type: 'string' }] }, true],
    [{ oneOf: [NULL_BRANCH, { enum: [null] }] }, false],
    [{ not: NULL_BRANCH }, false],
    [{ not: { type: 'string' } }, true],
    [{ if: NULL_BRANCH, then: { type: 'string' } }, false],
    [{ if: { type: 'string' }, then: { type: 'string' } }, true],
    [{ if: { type: 'string' }, else: { type: 'string' } }, false],
    [true, true],
    [false, false],
  ])('null is kept only when every keyword accepts it: %j', (property, kept) => {
    const input = { value: null };
    expect(omitNullToolArguments(input, toolSchema(property))).toEqual(kept ? { value: null } : {});
    expect(input).toEqual({ value: null });
  });

  it.each<[Record<string, unknown>, boolean]>([
    [{ a: { $ref: '#/$defs/a' } }, false],
    [{ a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } }, false],
    [{ a: { anyOf: [{ $ref: '#/$defs/a' }] } }, false],
    [{ a: { type: 'null', oneOf: [{ $ref: '#/$defs/a' }] } }, false],
    [{ a: { anyOf: [{ $ref: '#/$defs/b' }] }, b: { anyOf: [{ $ref: '#/$defs/a' }] } }, false],
    [{ a: { anyOf: [{ $ref: '#/$defs/a' }, NULL_BRANCH] } }, true],
    [{ a: { oneOf: [{ $ref: '#/$defs/a' }, NULL_BRANCH] } }, true],
  ])('reference cycles terminate: %j', (definitions, kept) => {
    const source = toolSchema({ $ref: '#/$defs/a' }, definitions);
    expect(omitNullToolArguments({ value: null }, source)).toEqual(kept ? { value: null } : {});
    expect(toStrictJsonSchema(source).unsupported).toEqual([]);
  });

  it('checks a node reached twice outside a cycle each time', () => {
    const shared = { anyOf: [NULL_BRANCH] };
    const source = { type: 'object', properties: { value: { allOf: [shared, shared] } } };
    expect(omitNullToolArguments({ value: null }, source)).toEqual({ value: null });
  });

  /** `a0` is the leaf; every `a(i)` references `a(i-1)` twice, so paths double per level. */
  const diamond = (levels: number, keyword: string, leaf: unknown) => {
    const definitions: Record<string, unknown> = { a0: leaf };
    for (let i = 1; i <= levels; i++) {
      const ref = { $ref: `#/$defs/a${i - 1}` };
      definitions[`a${i}`] = { [keyword]: [ref, ref] };
    }
    return toolSchema({ $ref: `#/$defs/a${levels}` }, definitions);
  };

  it('evaluates a definition shared by many branches once', () => {
    const rejecting = diamond(20, 'anyOf', { type: 'string' });
    expect(propertyOf(toStrictJsonSchema(rejecting).schema, 'value')).toEqual(
      wrapped({ $ref: '#/$defs/a20' })
    );
    expect(omitNullToolArguments({ value: null }, rejecting)).toEqual({});

    const accepting = diamond(20, 'allOf', NULL_BRANCH);
    expect(omitNullToolArguments({ value: null }, accepting)).toEqual({ value: null });
  });

  it('stays bounded when cycles keep answers from being remembered', () => {
    // Every level also points back at the top, so no answer below it is final.
    const levels = 20;
    const definitions: Record<string, unknown> = { a0: { type: 'string' } };
    for (let i = 1; i <= levels; i++) {
      const ref = { $ref: `#/$defs/a${i - 1}` };
      definitions[`a${i}`] = { anyOf: [ref, ref, { $ref: `#/$defs/a${levels}` }] };
    }
    const source = toolSchema({ $ref: `#/$defs/a${levels}` }, definitions);
    expect(omitNullToolArguments({ value: null }, source)).toEqual({});
    expect(propertyOf(toStrictJsonSchema(source).schema, 'value')).toEqual(
      wrapped({ $ref: `#/$defs/a${levels}` })
    );
  });

  it('does not prove null through a reference chain past the depth bound', () => {
    const definitions: Record<string, unknown> = { a0: NULL_BRANCH };
    for (let i = 1; i <= 100; i++) definitions[`a${i}`] = { $ref: `#/$defs/a${i - 1}` };
    expect(
      omitNullToolArguments({ value: null }, toolSchema({ $ref: '#/$defs/a100' }, definitions))
    ).toEqual({});
    expect(
      omitNullToolArguments({ value: null }, toolSchema({ $ref: '#/$defs/a10' }, definitions))
    ).toEqual({ value: null });
  });

  it('adds a null branch to a $ref whose target the rewrite types as an object', () => {
    const source = {
      type: 'object',
      properties: { node: { $ref: '#/$defs/Node' } },
      $defs: {
        Node: { properties: { label: { type: 'string' }, child: { $ref: '#/$defs/Node' } } },
      },
    };
    const { schema, unsupported } = toStrictJsonSchema(source);
    const definitions = schema.$defs as Record<string, Record<string, unknown>>;

    expect(unsupported).toEqual([]);
    expect(propertyOf(schema, 'node')).toEqual(wrapped({ $ref: '#/$defs/Node' }));
    expect(definitions.Node.type).toBe('object');
    expect(propertyOf(definitions.Node, 'child')).toEqual(wrapped({ $ref: '#/$defs/Node' }));
    // The tool's own schema accepts the null, so it is forwarded.
    expect(omitNullToolArguments({ node: null }, source)).toEqual({ node: null });
  });

  it('reports a $ref into a property that wrapping moved', () => {
    const { unsupported } = toStrictJsonSchema({
      type: 'object',
      properties: {
        value: { type: 'string', enum: ['asc'], $defs: { Text: { type: 'string' } } },
        alias: { $ref: '#/properties/value/$defs/Text' },
      },
      required: ['alias'],
    });
    expect(unsupported.map(({ path, keyword }) => ({ path, keyword }))).toEqual([
      { path: 'properties.alias', keyword: '$ref' },
    ]);
  });

  it('shares what it learned about a cyclic definition across many properties', () => {
    const levels = 20;
    const top = `#/$defs/a${levels}`;
    const definitions: Record<string, unknown> = { a0: { type: 'string' } };
    for (let i = 1; i <= levels; i++) {
      const lower = `#/$defs/a${i - 1}`;
      definitions[`a${i}`] = { anyOf: [{ $ref: lower }, { $ref: lower }, { $ref: top }] };
    }
    const names = Array.from({ length: 400 }, (_, i) => `p${i}`);
    const source = {
      type: 'object',
      properties: Object.fromEntries(names.map(name => [name, { $ref: top }])),
      $defs: definitions,
    };
    const { schema } = toStrictJsonSchema(source);
    for (const name of names) expect(propertyOf(schema, name)).toEqual(wrapped({ $ref: top }));
    const input = Object.fromEntries(names.map(name => [name, null]));
    expect(omitNullToolArguments(input, source)).toEqual({});
  });

  it('keeps a check that runs out of budget from affecting the next one', () => {
    const source = {
      type: 'object',
      properties: {
        wide: { anyOf: Array.from({ length: 5000 }, () => ({ type: 'string' })) },
        note: { type: ['string', 'null'] },
        same: { anyOf: [{ type: 'string' }, NULL_BRANCH] },
      },
    };
    expect(omitNullToolArguments({ wide: null, note: null, same: null }, source)).toEqual({
      note: null,
      same: null,
    });
    const { schema } = toStrictJsonSchema(source);
    expect(propertyOf(schema, 'note')).toEqual({ type: ['string', 'null'] });
    expect(propertyOf(schema, 'same')).toEqual({ anyOf: [{ type: 'string' }, NULL_BRANCH] });
  });

  it('proves nothing in a check that meets a bound', () => {
    // Both branches accept null, so `oneOf` rejects it; the second is only
    // reachable past the depth bound and must not count as a rejection.
    const definitions: Record<string, unknown> = { a0: NULL_BRANCH };
    for (let i = 1; i <= 70; i++) definitions[`a${i}`] = { $ref: `#/$defs/a${i - 1}` };
    const deep = { $ref: '#/$defs/a70' };
    const properties = {
      one: { oneOf: [NULL_BRANCH, deep] },
      negated: { not: deep },
      guarded: { if: deep, else: NULL_BRANCH },
      // Reaches a node the checks above left unproven.
      later: { not: { $ref: '#/$defs/a69' } },
    };
    const source = { type: 'object', properties, $defs: definitions };
    const input = Object.fromEntries(Object.keys(properties).map(name => [name, null]));
    expect(omitNullToolArguments(input, source)).toEqual({});
  });

  it('does not evaluate an unproven definition again for each property', () => {
    // `top` is cyclic and wider than the budget, so nothing about it settles.
    const top = { $ref: '#/$defs/top' };
    const definitions: Record<string, unknown> = {
      top: { anyOf: Array.from({ length: 3000 }, (_, i) => ({ $ref: `#/$defs/b${i}` })) },
    };
    for (let i = 0; i < 3000; i++) definitions[`b${i}`] = { anyOf: [top, { type: 'string' }] };
    const names = Array.from({ length: 2000 }, (_, i) => `p${i}`);
    const source = {
      type: 'object',
      properties: Object.fromEntries(names.map(name => [name, { ...top }])),
      $defs: definitions,
    };
    const input = Object.fromEntries(names.map(name => [name, null]));
    expect(omitNullToolArguments(input, source)).toEqual({});
    const { schema } = toStrictJsonSchema(source);
    for (const name of names) expect(propertyOf(schema, name)).toEqual(wrapped(top));
  });
});
