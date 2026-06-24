import { describe, it, expect, vi } from 'vitest';
import { dereferenceJsonSchema } from '../../src/utils/jsonSchema';
import { JsonSchemaRefResolutionError } from '../../src/errors/ValidationErrors';
import logger from '../../src/utils/logger';

const containsRef = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsRef);
  if ('$ref' in (value as Record<string, unknown>)) return true;
  return Object.values(value as Record<string, unknown>).some(containsRef);
};

describe('dereferenceJsonSchema', () => {
  it('inlines a single internal $ref under $defs', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: { user: { $ref: '#/$defs/User' } },
      required: ['user'],
      $defs: { User: { type: 'string' } },
    });

    expect(out).toEqual({
      type: 'object',
      properties: { user: { type: 'string' } },
      required: ['user'],
    });
    expect(containsRef(out)).toBe(false);
  });

  it('resolves a chain of refs A -> B -> C', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: { v: { $ref: '#/$defs/A' } },
      $defs: {
        A: { $ref: '#/$defs/B' },
        B: { $ref: '#/$defs/C' },
        C: { type: 'integer' },
      },
    });

    expect(containsRef(out)).toBe(false);
    expect((out as { properties: { v: unknown } }).properties.v).toEqual({ type: 'integer' });
  });

  it('walks containers reflectively (items, oneOf, anyOf, allOf, not, additionalProperties, patternProperties, prefixItems)', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: {
        a: { type: 'array', items: { $ref: '#/$defs/Leaf' } },
        b: { oneOf: [{ $ref: '#/$defs/Leaf' }, { type: 'null' }] },
        c: { anyOf: [{ $ref: '#/$defs/Leaf' }] },
        d: { allOf: [{ $ref: '#/$defs/Leaf' }] },
        e: { not: { $ref: '#/$defs/Leaf' } },
        f: { type: 'object', additionalProperties: { $ref: '#/$defs/Leaf' } },
        g: {
          type: 'object',
          patternProperties: { '^x_': { $ref: '#/$defs/Leaf' } },
        },
        h: { type: 'array', prefixItems: [{ $ref: '#/$defs/Leaf' }] },
      },
      $defs: { Leaf: { type: 'string' } },
    });

    expect(containsRef(out)).toBe(false);
  });

  it('resolves Draft 7 legacy `definitions`', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: { name: { $ref: '#/definitions/Name' } },
      definitions: { Name: { type: 'string', minLength: 1 } },
    });

    expect(containsRef(out)).toBe(false);
    expect((out as { properties: { name: unknown } }).properties.name).toEqual({
      type: 'string',
      minLength: 1,
    });
  });

  it('mixes $defs and definitions transitively', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: { v: { $ref: '#/definitions/A' } },
      definitions: { A: { $ref: '#/$defs/B' } },
      $defs: { B: { type: 'boolean' } },
    });

    expect(containsRef(out)).toBe(false);
    expect((out as { properties: { v: unknown } }).properties.v).toEqual({ type: 'boolean' });
  });

  it('shallow-merges sibling keywords next to $ref (Draft 2020-12 semantics; siblings win on collision)', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: {
        v: {
          $ref: '#/$defs/Foo',
          description: 'caller override',
          default: null,
        },
      },
      $defs: {
        Foo: { type: 'string', description: 'target description' },
      },
    });

    const v = (out as { properties: { v: Record<string, unknown> } }).properties.v;
    expect(v.type).toBe('string');
    expect(v.description).toBe('caller override');
    expect(v.default).toBeNull();
    expect(containsRef(out)).toBe(false);
  });

  it('breaks recursive $ref cycles with a permissive object sentinel', () => {
    const out = dereferenceJsonSchema({
      $ref: '#/$defs/Tree',
      $defs: {
        Tree: {
          type: 'object',
          properties: {
            children: { type: 'array', items: { $ref: '#/$defs/Tree' } },
          },
        },
      },
    });

    expect((out as { type: string }).type).toBe('object');
    const children = (
      out as {
        properties: { children: { items: { type: string; additionalProperties: boolean } } };
      }
    ).properties.children;
    expect(children.items).toEqual({ type: 'object', additionalProperties: true });
    expect(containsRef(out)).toBe(false);
  });

  it('strips $defs and definitions from the returned root schema', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: { x: { $ref: '#/$defs/Foo' } },
      $defs: { Foo: { type: 'integer' } },
      definitions: { Bar: { type: 'string' } },
    }) as Record<string, unknown>;

    expect(out.$defs).toBeUndefined();
    expect(out.definitions).toBeUndefined();
  });

  it('throws JsonSchemaRefResolutionError when target is missing', () => {
    expect(() =>
      dereferenceJsonSchema({
        type: 'object',
        properties: { v: { $ref: '#/$defs/Missing' } },
        $defs: {},
      })
    ).toThrow(JsonSchemaRefResolutionError);
  });

  it('throws JsonSchemaRefResolutionError when chain depth exceeds the cap', () => {
    const $defs: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      $defs[`A${i}`] = { $ref: i + 1 < 200 ? `#/$defs/A${i + 1}` : '#/$defs/A0' };
    }
    expect(() =>
      dereferenceJsonSchema({
        type: 'object',
        properties: { v: { $ref: '#/$defs/A0' } },
        $defs,
      })
    ).toThrow(JsonSchemaRefResolutionError);
  });

  it('throws JsonSchemaRefResolutionError on pathologically deep object nesting', () => {
    // Build { properties: { x: { properties: { x: { ... } } } } } 1000 levels deep.
    // Without a node-depth cap this would blow the V8 stack; with the cap, it throws
    // a typed error before recursion grows unbounded.
    type Nested = { type: 'object'; properties: { x: Nested | { type: 'string' } } };
    let leaf: Nested | { type: 'string' } = { type: 'string' };
    for (let i = 0; i < 1000; i++) {
      leaf = { type: 'object', properties: { x: leaf } } as Nested;
    }
    expect(() => dereferenceJsonSchema(leaf)).toThrow(JsonSchemaRefResolutionError);
  });

  it('breaks JS object cycles that do not flow through a $ref', () => {
    // Composio ingests schemas as live JS objects (custom tools, telemetry, …),
    // so a non-$ref cycle is plausible. Without object-identity cycle detection
    // this would infinite-loop; with it, the cycle returns the permissive sentinel.
    const root: Record<string, unknown> = {
      type: 'object',
      properties: {},
    };
    (root.properties as Record<string, unknown>).self = root;

    const out = dereferenceJsonSchema(root) as {
      properties: { self: { type: string; additionalProperties: boolean } };
    };
    expect(out.properties.self).toEqual({ type: 'object', additionalProperties: true });
  });

  it('leaves external $ref pointers untouched and warns once for audit', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      const out = dereferenceJsonSchema({
        type: 'object',
        properties: { v: { $ref: 'https://example.com/Foo' } },
      });

      expect((out as { properties: { v: { $ref: string } } }).properties.v.$ref).toBe(
        'https://example.com/Foo'
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('https://example.com/Foo'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('filters prototype-pollution keys when cloning', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: {
        v: { $ref: '#/$defs/User' },
      },
      $defs: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        User: { type: 'object', __proto__: { polluted: true } } as any,
      },
    } as Record<string, unknown>);

    const v = (out as { properties: { v: Record<string, unknown> } }).properties.v;
    expect('__proto__' in v && (v as Record<string, unknown>).__proto__).not.toEqual({
      polluted: true,
    });
    // The cloned node's prototype should remain Object.prototype.
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
  });

  it('does not mutate the input schema', () => {
    const input = {
      type: 'object',
      properties: { v: { $ref: '#/$defs/Foo' } },
      $defs: { Foo: { type: 'string' } },
    };
    const snapshot = structuredClone(input);
    dereferenceJsonSchema(input);
    expect(input).toEqual(snapshot);
  });

  it('decodes JSON Pointer escape sequences (~1 -> /, ~0 -> ~) in the correct order', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: {
        a: { $ref: '#/$defs/with~1slash' },
        b: { $ref: '#/$defs/with~0tilde' },
        c: { $ref: '#/$defs/tilde-then-slash~01' },
      },
      $defs: {
        'with/slash': { type: 'string' },
        'with~tilde': { type: 'integer' },
        'tilde-then-slash~1': { type: 'boolean' },
      },
    } as unknown as Record<string, unknown>);

    const props = (out as { properties: Record<string, { type: string }> }).properties;
    expect(props.a.type).toBe('string');
    expect(props.b.type).toBe('integer');
    expect(props.c.type).toBe('boolean');
  });

  it('resolves array-index pointers (#/$defs/foo/oneOf/0)', () => {
    const out = dereferenceJsonSchema({
      type: 'object',
      properties: { v: { $ref: '#/$defs/foo/oneOf/0' } },
      $defs: {
        foo: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      },
    } as unknown as Record<string, unknown>);

    expect((out as { properties: { v: { type: string } } }).properties.v.type).toBe('string');
  });

  describe("with onUnresolved: 'sentinel' lenient mode", () => {
    // Sentinel injected for an unresolvable $ref carries an LLM-visible hint
    // describing the degradation. The hint is overwritten by a caller-provided
    // `description` sibling when present (Draft 2020-12 sibling-keyword merge).
    const PERMISSIVE = {
      type: 'object',
      additionalProperties: true,
      description: expect.stringContaining('Schema shape unresolved at the source'),
    };

    it('replaces a dangling internal $ref (no $defs block at all) with the cycle-break sentinel', () => {
      // Mirrors GMAIL_FETCH_EMAILS.outputParameters: a $ref into #/$defs/...
      // without any $defs declared on the root.
      const out = dereferenceJsonSchema(
        {
          type: 'object',
          properties: {
            data: { $ref: '#/$defs/FetchEmailsResponse' },
            error: { type: 'string' },
            successful: { type: 'boolean' },
          },
          required: ['data', 'successful'],
          title: 'FetchEmailsResponseWrapper',
        },
        { onUnresolved: 'sentinel' }
      ) as {
        type: string;
        properties: { data: unknown; error: unknown; successful: unknown };
        required: string[];
      };

      expect(out.properties.data).toEqual(PERMISSIVE);
      // Siblings of the replaced node are untouched.
      expect(out.properties.error).toEqual({ type: 'string' });
      expect(out.properties.successful).toEqual({ type: 'boolean' });
      expect(out.required).toEqual(['data', 'successful']);
      expect(containsRef(out)).toBe(false);
    });

    it('replaces a $ref that points into an empty $defs (missing key) with the sentinel', () => {
      const out = dereferenceJsonSchema(
        {
          type: 'object',
          properties: { v: { $ref: '#/$defs/Missing' } },
          $defs: {},
        },
        { onUnresolved: 'sentinel' }
      ) as { properties: { v: unknown } };

      expect(out.properties.v).toEqual(PERMISSIVE);
      expect(containsRef(out)).toBe(false);
    });

    it("invokes onReplace once per replacement with the original ref and reason 'missing-target'", () => {
      const calls: Array<[string, string]> = [];
      dereferenceJsonSchema(
        {
          type: 'object',
          properties: {
            a: { $ref: '#/$defs/Missing' },
            b: { $ref: '#/$defs/Missing' },
            c: { $ref: '#/$defs/AlsoMissing' },
          },
        },
        {
          onUnresolved: 'sentinel',
          onReplace: (ref, reason) => calls.push([ref, reason]),
        }
      );

      expect(calls).toEqual([
        ['#/$defs/Missing', 'missing-target'],
        ['#/$defs/Missing', 'missing-target'],
        ['#/$defs/AlsoMissing', 'missing-target'],
      ]);
    });

    it("invokes onReplace with reason 'malformed-pointer' for a non '/' internal pointer", () => {
      const calls: Array<[string, string]> = [];
      const out = dereferenceJsonSchema(
        {
          type: 'object',
          properties: { v: { $ref: '#bar' } },
        },
        {
          onUnresolved: 'sentinel',
          onReplace: (ref, reason) => calls.push([ref, reason]),
        }
      ) as { properties: { v: unknown } };

      expect(calls).toEqual([['#bar', 'malformed-pointer']]);
      expect(out.properties.v).toEqual(PERMISSIVE);
    });

    it('still throws JsonSchemaRefResolutionError when chain depth exceeds the cap (safety cap is not lenient)', () => {
      const $defs: Record<string, unknown> = {};
      for (let i = 0; i < 200; i++) {
        $defs[`A${i}`] = { $ref: i + 1 < 200 ? `#/$defs/A${i + 1}` : '#/$defs/A0' };
      }
      expect(() =>
        dereferenceJsonSchema(
          {
            type: 'object',
            properties: { v: { $ref: '#/$defs/A0' } },
            $defs,
          },
          { onUnresolved: 'sentinel' }
        )
      ).toThrow(JsonSchemaRefResolutionError);
    });

    it('still throws JsonSchemaRefResolutionError when node depth exceeds the cap (safety cap is not lenient)', () => {
      type Nested = { type: 'object'; properties: { x: Nested | { type: 'string' } } };
      let leaf: Nested | { type: 'string' } = { type: 'string' };
      for (let i = 0; i < 1000; i++) {
        leaf = { type: 'object', properties: { x: leaf } } as Nested;
      }
      expect(() => dereferenceJsonSchema(leaf, { onUnresolved: 'sentinel' })).toThrow(
        JsonSchemaRefResolutionError
      );
    });

    it("explicit onUnresolved: 'throw' matches default behavior", () => {
      expect(() =>
        dereferenceJsonSchema(
          {
            type: 'object',
            properties: { v: { $ref: '#/$defs/Missing' } },
            $defs: {},
          },
          { onUnresolved: 'throw' }
        )
      ).toThrow(JsonSchemaRefResolutionError);
    });

    it('does not call onReplace in strict mode (regression guard)', () => {
      const onReplace = vi.fn();
      expect(() =>
        dereferenceJsonSchema(
          {
            type: 'object',
            properties: { v: { $ref: '#/$defs/Missing' } },
            $defs: {},
          },
          { onUnresolved: 'throw', onReplace }
        )
      ).toThrow(JsonSchemaRefResolutionError);
      expect(onReplace).not.toHaveBeenCalled();
    });

    it("injects a default LLM-visible 'description' on the sentinel when the source $ref node has none", () => {
      const out = dereferenceJsonSchema(
        {
          type: 'object',
          properties: { v: { $ref: '#/$defs/Missing' } },
        },
        { onUnresolved: 'sentinel' }
      ) as { properties: { v: { description: string } } };

      expect(out.properties.v.description).toMatch(/Schema shape unresolved at the source/);
      expect(out.properties.v.description).toContain(
        'https://github.com/ComposioHQ/composio/issues/3307'
      );
    });

    it("preserves a caller-provided 'description' sibling instead of overwriting with the default", () => {
      const out = dereferenceJsonSchema(
        {
          type: 'object',
          properties: {
            v: {
              $ref: '#/$defs/Missing',
              description: 'caller-supplied prose context',
            },
          },
        },
        { onUnresolved: 'sentinel' }
      ) as { properties: { v: { description: string; type: string } } };

      // Sibling-merge wins over the default — caller context survives.
      expect(out.properties.v.description).toBe('caller-supplied prose context');
      expect(out.properties.v.type).toBe('object');
    });

    it('preserves resolvable $defs while replacing only the dangling branch (mixed schema)', () => {
      const out = dereferenceJsonSchema(
        {
          type: 'object',
          properties: {
            resolved: { $ref: '#/$defs/Real' },
            dangling: { $ref: '#/$defs/Ghost' },
          },
          $defs: {
            Real: { type: 'integer' },
          },
        },
        { onUnresolved: 'sentinel' }
      ) as { properties: { resolved: { type: string }; dangling: unknown } };

      expect(out.properties.resolved).toEqual({ type: 'integer' });
      expect(out.properties.dangling).toEqual(PERMISSIVE);
    });
  });
});
