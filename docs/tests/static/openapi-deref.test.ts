import { describe, expect, test } from 'bun:test';

import { dereferenceDocument } from '../../lib/openapi-deref';

// The llms.mdx renderers consume the fully resolved shape produced here.

describe('dereferenceDocument', () => {
  test('inlines a local reference', () => {
    const spec = {
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    };

    const out = dereferenceDocument(spec) as typeof spec;
    const schema = out.paths['/users'].get.responses['200'].content['application/json'].schema;

    expect(schema).toEqual({ type: 'object', properties: { id: { type: 'string' } } });
  });

  test('does not mutate the source document', () => {
    const spec = {
      paths: { '/a': { get: { schema: { $ref: '#/components/schemas/A' } } } },
      components: { schemas: { A: { type: 'string' } } },
    };

    dereferenceDocument(spec);

    expect(spec.paths['/a'].get.schema).toEqual({ $ref: '#/components/schemas/A' });
  });

  test('reuses the dereferenced copy for the same document instance', () => {
    const spec = {
      root: { $ref: '#/components/schemas/A' },
      components: { schemas: { A: { type: 'string' } } },
    };

    const first = dereferenceDocument(spec);

    expect(dereferenceDocument(spec)).toBe(first);
  });

  test('merges sibling keywords over the referenced target', () => {
    const spec = {
      root: { $ref: '#/components/schemas/A', description: 'overridden' },
      components: { schemas: { A: { type: 'string', description: 'original' } } },
    };

    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };

    expect(out.root.type).toBe('string');
    expect(out.root.description).toBe('overridden');
  });

  test('does not leak sibling overrides into other uses of the same ref', () => {
    const spec = {
      a: { $ref: '#/components/schemas/A', description: 'only-here' },
      b: { $ref: '#/components/schemas/A' },
      components: { schemas: { A: { type: 'string', description: 'original' } } },
    };

    const out = dereferenceDocument(spec) as {
      a: Record<string, unknown>;
      b: Record<string, unknown>;
    };

    expect(out.a.description).toBe('only-here');
    expect(out.b.description).toBe('original');
  });

  test('terminates on a self-referential schema', () => {
    const spec = {
      root: { $ref: '#/components/schemas/Node' },
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              child: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    };

    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };
    const root = out.root as {
      type: string;
      properties: { child: unknown; value: unknown };
    };

    expect(root.type).toBe('object');
    // The cycle resolves to the same object rather than recursing forever.
    expect(root.properties.child).toBe(root);
  });

  test('terminates on mutually recursive schemas', () => {
    const spec = {
      root: { $ref: '#/components/schemas/A' },
      components: {
        schemas: {
          A: { type: 'object', properties: { b: { $ref: '#/components/schemas/B' } } },
          B: { type: 'object', properties: { a: { $ref: '#/components/schemas/A' } } },
        },
      },
    };

    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };
    const root = out.root as { properties: { b: { properties: { a: unknown } } } };

    expect(root.properties.b.properties.a).toBe(root);
  });

  test('follows an alias chain when a component is itself a reference', () => {
    const spec = {
      root: { $ref: '#/components/schemas/Alias' },
      components: {
        schemas: {
          Alias: { $ref: '#/components/schemas/Real' },
          Real: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    };

    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };

    expect(out.root.type).toBe('object');
    expect(out.root.properties).toEqual({ id: { type: 'string' } });
  });

  test('lets an alias sibling keyword override the aliased target', () => {
    const spec = {
      root: { $ref: '#/components/schemas/Alias' },
      components: {
        schemas: {
          Alias: { $ref: '#/components/schemas/Real', description: 'alias-desc' },
          Real: { type: 'object', description: 'real-desc' },
        },
      },
    };

    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };

    expect(out.root.type).toBe('object');
    expect(out.root.description).toBe('alias-desc');
  });

  test('terminates on a cyclic alias chain', () => {
    const spec = {
      root: { $ref: '#/components/schemas/A' },
      components: {
        schemas: {
          A: { $ref: '#/components/schemas/B' },
          B: { $ref: '#/components/schemas/A' },
        },
      },
    };

    // Pathological input with no real schema behind it: the requirement is that
    // it terminates rather than recursing forever.
    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };

    expect(out.root).toBeDefined();
    expect(out.root.$ref).toBeUndefined();
  });

  test('leaves external references untouched', () => {
    const spec = { root: { $ref: 'https://example.com/schema.json#/Foo' } };

    const out = dereferenceDocument(spec) as typeof spec;

    expect(out.root).toEqual({ $ref: 'https://example.com/schema.json#/Foo' });
  });

  test('decodes JSON Pointer escapes in reference paths', () => {
    const spec = {
      root: { $ref: '#/components/schemas/a~1b' },
      components: { schemas: { 'a/b': { type: 'number' } } },
    };

    const out = dereferenceDocument(spec) as { root: Record<string, unknown> };

    expect(out.root.type).toBe('number');
  });

  test('resolves references inside arrays', () => {
    const spec = {
      root: { oneOf: [{ $ref: '#/components/schemas/A' }, { type: 'null' }] },
      components: { schemas: { A: { type: 'string' } } },
    };

    const out = dereferenceDocument(spec) as { root: { oneOf: unknown[] } };

    expect(out.root.oneOf[0]).toEqual({ type: 'string' });
    expect(out.root.oneOf[1]).toEqual({ type: 'null' });
  });
});
