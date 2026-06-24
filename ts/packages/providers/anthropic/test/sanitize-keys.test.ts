import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '../src';
import type { AnthropicTool } from '../src/types';
import type { Tool } from '@composio/core';
import {
  sanitizeSchemaPropertyKeys,
  restoreOriginalKeys,
  mappingHasRenames,
} from '../src/sanitize-keys';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: vi.fn() } })),
}));

const ANTHROPIC_KEY_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

describe('sanitizeSchemaPropertyKeys', () => {
  it('leaves already-valid keys untouched and reports no mapping', () => {
    const schema = {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);

    expect(out).toEqual(schema);
    expect(mappingHasRenames(mapping)).toBe(false);
  });

  it('rewrites OData keys with illegal `$` and `@` characters', () => {
    const schema = {
      type: 'object',
      properties: {
        $top: { type: 'integer' },
        $filter: { type: 'string' },
        '@microsoft.graph.conflictBehavior': { type: 'string' },
      },
      required: ['$top', '@microsoft.graph.conflictBehavior'],
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    const props = out.properties as Record<string, unknown>;

    // Every emitted key must satisfy Anthropic's pattern.
    for (const key of Object.keys(props)) {
      expect(key).toMatch(ANTHROPIC_KEY_RE);
    }

    expect(props).toHaveProperty('dollar_top');
    expect(props).toHaveProperty('dollar_filter');
    expect(props).toHaveProperty('at_microsoft.graph.conflictBehavior');

    // Mapping points sanitized keys back to the originals (at this level).
    expect(mapping.renames['dollar_top']).toBe('$top');
    expect(mapping.renames['at_microsoft.graph.conflictBehavior']).toBe(
      '@microsoft.graph.conflictBehavior'
    );

    // `required` is rewritten to match the sanitized keys.
    expect(out.required).toEqual(['dollar_top', 'at_microsoft.graph.conflictBehavior']);

    // Property values are preserved.
    expect(props['dollar_top']).toEqual({ type: 'integer' });
  });

  it('preserves the legal `.` and `-` characters Anthropic allows', () => {
    const schema = {
      type: 'object',
      properties: { 'a.b-c': { type: 'string' } },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);

    expect(out.properties).toHaveProperty('a.b-c');
    expect(mappingHasRenames(mapping)).toBe(false);
  });

  it('truncates keys longer than 64 characters to a deterministic alias', () => {
    const longKey = 'settings__continuous__meeting__chat__auto__add__invited__external__users';
    expect(longKey.length).toBeGreaterThan(64);

    const schema = { type: 'object', properties: { [longKey]: { type: 'boolean' } } };

    const first = sanitizeSchemaPropertyKeys(schema);
    const second = sanitizeSchemaPropertyKeys(schema);

    const [aliasA] = Object.keys(first.schema.properties as Record<string, unknown>);
    const [aliasB] = Object.keys(second.schema.properties as Record<string, unknown>);

    expect(aliasA).toMatch(ANTHROPIC_KEY_RE);
    expect(aliasA.length).toBeLessThanOrEqual(64);
    expect(aliasA).toBe(aliasB); // deterministic
    expect(first.mapping.renames[aliasA]).toBe(longKey);
  });

  it('keeps distinct originals distinct when they would collide', () => {
    const schema = {
      type: 'object',
      properties: { $top: { type: 'integer' }, dollar_top: { type: 'string' } },
    };

    const { schema: out } = sanitizeSchemaPropertyKeys(schema);
    const keys = Object.keys(out.properties as Record<string, unknown>);

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    keys.forEach(k => expect(k).toMatch(ANTHROPIC_KEY_RE));
  });

  it('sanitizes nested object properties recursively', () => {
    const schema = {
      type: 'object',
      properties: {
        options: {
          type: 'object',
          properties: { $skip: { type: 'integer' } },
          required: ['$skip'],
        },
      },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    const nested = (out.properties as any).options;

    expect(nested.properties).toHaveProperty('dollar_skip');
    expect(nested.required).toEqual(['dollar_skip']);

    // The rename is recorded at the nested level, not flattened onto the root.
    expect(mapping.renames).toEqual({});
    expect(mapping.children['options'].renames['dollar_skip']).toBe('$skip');
  });

  it('does not mutate the input schema', () => {
    const schema = {
      type: 'object',
      properties: { $top: { type: 'integer' } },
      required: ['$top'],
    };
    const snapshot = JSON.parse(JSON.stringify(schema));

    sanitizeSchemaPropertyKeys(schema);

    expect(schema).toEqual(snapshot);
  });

  // P2-2: illegal keys nested inside array element schemas must be sanitized too,
  // otherwise they slip past a `properties`-only walk and still trigger a 400.
  it('sanitizes illegal keys nested inside array item schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { $top: { type: 'integer' } },
            required: ['$top'],
          },
        },
      },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    const itemSchema = (out.properties as any).rows.items;

    expect(itemSchema.properties).toHaveProperty('dollar_top');
    expect(itemSchema.properties).not.toHaveProperty('$top');
    expect(itemSchema.required).toEqual(['dollar_top']);

    // Restoration walks into array elements via the items mapping.
    const restored = restoreOriginalKeys({ rows: [{ dollar_top: 1 }, { dollar_top: 2 }] }, mapping);
    expect(restored).toEqual({ rows: [{ $top: 1 }, { $top: 2 }] });
  });

  it('sanitizes illegal keys in tuple (positional) array item schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        pair: {
          type: 'array',
          items: [
            { type: 'object', properties: { $top: { type: 'integer' } } },
            { type: 'object', properties: { plain: { type: 'string' } } },
          ],
        },
      },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    const [first, second] = (out.properties as any).pair.items;

    expect(first.properties).toHaveProperty('dollar_top');
    expect(second.properties).toHaveProperty('plain');

    const restored = restoreOriginalKeys({ pair: [{ dollar_top: 9 }, { plain: 'x' }] }, mapping);
    expect(restored).toEqual({ pair: [{ $top: 9 }, { plain: 'x' }] });
  });

  // A key that is empty (or made entirely of stripped characters) would emit
  // `''`, which still violates Anthropic's `{1,64}` length bound.
  it('emits a non-empty conforming alias for empty / all-illegal keys', () => {
    const schema = {
      type: 'object',
      properties: { '': { type: 'string' }, '@@@': { type: 'integer' } },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    const keys = Object.keys(out.properties as Record<string, unknown>);

    expect(keys).toHaveLength(2);
    keys.forEach(k => expect(k).toMatch(ANTHROPIC_KEY_RE)); // each ≥ 1 char and conforming
    expect(new Set(Object.values(mapping.renames))).toEqual(new Set(['', '@@@']));
  });

  // Pathologically deep schemas must fail loudly rather than overflow the stack.
  it('throws instead of overflowing the stack on deeply nested schemas', () => {
    let deep: Record<string, unknown> = {
      type: 'object',
      properties: { $x: { type: 'integer' } },
    };
    for (let i = 0; i < 2000; i++) {
      deep = { type: 'object', properties: { nested: deep } };
    }

    expect(() => sanitizeSchemaPropertyKeys(deep)).toThrow(/depth/i);
  });

  // Property keys that collide with `Object.prototype` member names must be
  // treated as ordinary keys, never reparent the emitted schema, and never
  // mutate `Object.prototype`. Built via JSON.parse so `__proto__` is a real
  // own key rather than prototype-setting literal syntax.
  it('treats prototype-member property names as ordinary keys', () => {
    const schema = JSON.parse(
      '{"type":"object","properties":{"$top":{"type":"integer"},"__proto__":{"type":"string"},"constructor":{"type":"string"}}}'
    );

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    const props = out.properties as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(props, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(props, 'constructor')).toBe(true);
    expect(props['constructor']).toEqual({ type: 'string' });
    expect(({} as Record<string, unknown>).type).toBeUndefined(); // prototype untouched

    const restored = restoreOriginalKeys({ dollar_top: 1, constructor: 'c' }, mapping) as Record<
      string,
      unknown
    >;
    expect(restored['$top']).toBe(1);
    expect(restored['constructor']).toBe('c');
  });
});

describe('sanitizeSchemaPropertyKeys composition coverage', () => {
  // Asserts every emitted `properties` key (at any depth) conforms to Anthropic's
  // pattern — i.e. nothing illegal slipped through the traversal and could 400.
  const expectNoIllegalPropertyKeys = (schema: unknown) => {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (obj.properties && typeof obj.properties === 'object') {
        for (const key of Object.keys(obj.properties as Record<string, unknown>)) {
          expect(key).toMatch(ANTHROPIC_KEY_RE);
        }
      }
      Object.values(obj).forEach(walk);
    };
    walk(schema);
  };

  it('sanitizes and restores illegal keys nested under `anyOf` branches', () => {
    const schema = {
      type: 'object',
      properties: {
        foo: {
          anyOf: [
            { type: 'object', properties: { $top: { type: 'integer' } }, required: ['$top'] },
            { type: 'object', properties: { bar: { type: 'string' } } },
          ],
        },
      },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    expectNoIllegalPropertyKeys(out);
    expect((out.properties as any).foo.anyOf[0].properties).toHaveProperty('dollar_top');

    // The branch rename folds into `foo`'s value level, so restoration finds it.
    expect(restoreOriginalKeys({ foo: { dollar_top: 5 } }, mapping)).toEqual({ foo: { $top: 5 } });
  });

  it('merges `oneOf` / `allOf` renames into the shared value level', () => {
    const oneOf = sanitizeSchemaPropertyKeys({
      type: 'object',
      oneOf: [{ properties: { $top: { type: 'integer' } } }, { properties: { plain: {} } }],
    });
    expectNoIllegalPropertyKeys(oneOf.schema);
    expect(restoreOriginalKeys({ dollar_top: 1 }, oneOf.mapping)).toEqual({ $top: 1 });

    const allOf = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: { keep: { type: 'string' } },
      allOf: [{ properties: { '@odata.type': { type: 'string' } } }],
    });
    expectNoIllegalPropertyKeys(allOf.schema);
    expect(restoreOriginalKeys({ 'at_odata.type': 'x', keep: 'y' }, allOf.mapping)).toEqual({
      '@odata.type': 'x',
      keep: 'y',
    });
  });

  it('selects the right branch mapping by value type for a mixed `anyOf`', () => {
    const { mapping } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: {
        field: {
          anyOf: [
            { type: 'array', items: { type: 'object', properties: { $top: { type: 'integer' } } } },
            { type: 'object', properties: { $skip: { type: 'integer' } } },
          ],
        },
      },
    });

    // Array value → array-branch (`items`) mapping; object value → object branch.
    expect(restoreOriginalKeys({ field: [{ dollar_top: 1 }] }, mapping)).toEqual({
      field: [{ $top: 1 }],
    });
    expect(restoreOriginalKeys({ field: { dollar_skip: 2 } }, mapping)).toEqual({
      field: { $skip: 2 },
    });
  });

  it('sanitizes (but does not restore) keys nested under `additionalProperties`', () => {
    const schema = {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'object', properties: { $top: { type: 'integer' } } },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);
    // 400-prevention: the alias is emitted so Anthropic accepts the schema.
    expect((out as any).additionalProperties.properties).toHaveProperty('dollar_top');
    // Documented limitation: dynamic-key values are not restored — the alias
    // reaches the backend rather than being silently (mis)mapped at every level.
    expect(restoreOriginalKeys({ anyKey: { dollar_top: 1 } }, mapping)).toEqual({
      anyKey: { dollar_top: 1 },
    });
  });

  it('sanitizes keys nested under `$defs` for Anthropic acceptance', () => {
    const { schema: out } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: { x: { $ref: '#/$defs/Foo' } },
      $defs: { Foo: { type: 'object', properties: { $top: { type: 'integer' } } } },
    });

    expectNoIllegalPropertyKeys(out);
    expect((out as any).$defs.Foo.properties).toHaveProperty('dollar_top');
  });

  it('sanitizes and restores `prefixItems` tuples', () => {
    const { schema: out, mapping } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: {
        pair: {
          type: 'array',
          prefixItems: [
            { type: 'object', properties: { $top: { type: 'integer' } } },
            { type: 'object', properties: { plain: { type: 'string' } } },
          ],
        },
      },
    });

    expectNoIllegalPropertyKeys(out);
    expect(restoreOriginalKeys({ pair: [{ dollar_top: 9 }, { plain: 'x' }] }, mapping)).toEqual({
      pair: [{ $top: 9 }, { plain: 'x' }],
    });
  });

  it('restores a `prefixItems` tuple and a trailing `items` rest schema independently', () => {
    // 2020-12: `prefixItems` pins positions 0..n-1; a sibling single `items` schema
    // applies to every element past the tuple. Both carry illegal keys that must
    // round-trip at their own positions — the prefix rename must not be dropped,
    // and the rest mapping must not bleed onto the prefix position.
    const { schema: out, mapping } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: {
        tuple: {
          type: 'array',
          prefixItems: [{ type: 'object', properties: { $top: { type: 'integer' } } }],
          items: { type: 'object', properties: { '@odata.type': { type: 'string' } } },
        },
      },
    });

    expectNoIllegalPropertyKeys(out);
    expect(
      restoreOriginalKeys(
        { tuple: [{ dollar_top: 5 }, { 'at_odata.type': 'a' }, { 'at_odata.type': 'b' }] },
        mapping
      )
    ).toEqual({ tuple: [{ $top: 5 }, { '@odata.type': 'a' }, { '@odata.type': 'b' }] });
  });
});

describe('restoreOriginalKeys', () => {
  it('restores sanitized keys back to their originals, including nested values', () => {
    const { mapping } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: {
        $top: { type: 'integer' },
        nested: { type: 'object', properties: { $skip: { type: 'integer' } } },
      },
    });

    expect(
      restoreOriginalKeys({ dollar_top: 10, nested: { dollar_skip: 5, keep: 'x' } }, mapping)
    ).toEqual({ $top: 10, nested: { $skip: 5, keep: 'x' } });
  });

  it('passes through values when nothing was renamed', () => {
    const { mapping } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    const args = { query: 'hello', items: [1, 2, 3] };
    expect(restoreOriginalKeys(args, mapping)).toEqual(args);
  });

  // P2-1: a sanitized alias generated at one nesting level must not rewrite a
  // legitimately-named key that equals that alias at a *different* level. The old
  // flat global map corrupted the nested `dollar_top` into `$top`.
  it('does not rewrite a legitimate key that collides with an alias at another level', () => {
    const schema = {
      type: 'object',
      properties: {
        $top: { type: 'integer' }, // -> dollar_top at the root
        filters: {
          type: 'object',
          // A genuine, already-valid `dollar_top` that must survive untouched.
          properties: { dollar_top: { type: 'string' } },
        },
      },
    };

    const { schema: out, mapping } = sanitizeSchemaPropertyKeys(schema);

    expect(out.properties).toHaveProperty('dollar_top');
    expect((out.properties as any).filters.properties).toHaveProperty('dollar_top');

    const restored = restoreOriginalKeys(
      { dollar_top: 10, filters: { dollar_top: 'keep-me' } },
      mapping
    );

    expect(restored).toEqual({
      $top: 10, // root alias restored to the OData name
      filters: { dollar_top: 'keep-me' }, // nested genuine key left alone
    });
  });

  // Security: a model can emit argument keys equal to Object.prototype member
  // names (and `__proto__` reaches restoration via the JSON-string input path).
  // Restoration must not crash, must not corrupt the payload, and must never
  // mutate Object.prototype — the reverse maps and result object are all
  // prototype-free.
  it('handles prototype-member keys in tool arguments without crashing or polluting', () => {
    const { mapping } = sanitizeSchemaPropertyKeys({
      type: 'object',
      properties: { $top: { type: 'integer' }, name: { type: 'string' } },
      required: ['$top'],
    });

    const input = JSON.parse(
      '{"dollar_top":1,"constructor":{"inner":2},"toString":"t","__proto__":{"polluted":true},"hasOwnProperty":"h","name":"n"}'
    );

    // Threw with `TypeError` before this PR's hardening (lookups resolved to the
    // inherited `Object` function); a plain assignment here would also fail.
    const restored = restoreOriginalKeys(input, mapping) as Record<string, unknown>;

    expect(restored['$top']).toBe(1);
    expect(restored['name']).toBe('n');
    expect(restored['toString']).toBe('t');
    expect(restored['hasOwnProperty']).toBe('h');
    expect((restored['constructor'] as Record<string, unknown>).inner).toBe(2);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // prototype untouched
  });
});

describe('AnthropicProvider key sanitization', () => {
  const odataTool: Tool = {
    slug: 'list_drive_item_activities',
    name: 'List drive item activities',
    description: 'Lists activities on a OneDrive item',
    inputParameters: {
      type: 'object',
      properties: {
        $top: { type: 'integer' },
        $filter: { type: 'string' },
      },
      required: ['$top'],
    },
    tags: [],
  } as unknown as Tool;

  it('emits an Anthropic-compatible schema from wrapTool', () => {
    const provider = new AnthropicProvider();
    const wrapped = provider.wrapTool(odataTool) as AnthropicTool;
    const props = wrapped.input_schema.properties as Record<string, unknown>;

    for (const key of Object.keys(props)) {
      expect(key).toMatch(ANTHROPIC_KEY_RE);
    }
    expect(props).toHaveProperty('dollar_top');
  });

  it('restores original OData keys before executing the tool call', async () => {
    const provider = new AnthropicProvider();
    const executeToolFn = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null, successful: true });
    provider._setExecuteToolFn(executeToolFn);

    // Wrapping registers the reverse mapping for this tool slug.
    provider.wrapTool(odataTool);

    // The model calls the tool using the sanitized key names.
    await provider.executeToolCall('user-1', {
      type: 'tool_use',
      id: 'tu_1',
      name: 'list_drive_item_activities',
      input: { dollar_top: 25 },
    });

    expect(executeToolFn).toHaveBeenCalledTimes(1);
    const [, payload] = executeToolFn.mock.calls[0];
    expect(payload.arguments).toEqual({ $top: 25 });
  });

  it('leaves arguments untouched for tools without sanitized keys', async () => {
    const provider = new AnthropicProvider();
    const executeToolFn = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null, successful: true });
    provider._setExecuteToolFn(executeToolFn);

    const plainTool: Tool = {
      slug: 'plain-tool',
      name: 'Plain',
      description: 'no illegal keys',
      inputParameters: { type: 'object', properties: { query: { type: 'string' } } },
      tags: [],
    } as unknown as Tool;

    provider.wrapTool(plainTool);
    await provider.executeToolCall('user-1', {
      type: 'tool_use',
      id: 'tu_2',
      name: 'plain-tool',
      input: { query: 'hello' },
    });

    const [, payload] = executeToolFn.mock.calls[0];
    expect(payload.arguments).toEqual({ query: 'hello' });
  });

  // Models occasionally emit tool input as a JSON *string* (issue #2406). The
  // provider normalizes it to an object before restoring keys; restoring a raw
  // string would be a no-op, so this guards the normalize-then-restore ordering.
  it('normalizes a JSON-string input before restoring sanitized keys', async () => {
    const provider = new AnthropicProvider();
    const executeToolFn = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null, successful: true });
    provider._setExecuteToolFn(executeToolFn);

    provider.wrapTool(odataTool);

    await provider.executeToolCall('user-1', {
      type: 'tool_use',
      id: 'tu_3',
      name: 'list_drive_item_activities',
      input: '{"dollar_top": 25}' as unknown as Record<string, unknown>,
    });

    const [, payload] = executeToolFn.mock.calls[0];
    expect(payload.arguments).toEqual({ $top: 25 });
  });

  it('normalizes a JSON-string input for tools without sanitized keys (issue #2406)', async () => {
    const provider = new AnthropicProvider();
    const executeToolFn = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null, successful: true });
    provider._setExecuteToolFn(executeToolFn);

    const plainTool: Tool = {
      slug: 'plain-tool',
      name: 'Plain',
      description: 'no illegal keys',
      inputParameters: { type: 'object', properties: { query: { type: 'string' } } },
      tags: [],
    } as unknown as Tool;

    provider.wrapTool(plainTool);
    await provider.executeToolCall('user-1', {
      type: 'tool_use',
      id: 'tu_4',
      name: 'plain-tool',
      input: '{"query":"hello"}' as unknown as Record<string, unknown>,
    });

    const [, payload] = executeToolFn.mock.calls[0];
    expect(payload.arguments).toEqual({ query: 'hello' });
  });

  // Re-wrapping the same slug with a schema that no longer needs rewriting must
  // clear the stale mapping, so a later execution does not restore keys that the
  // current schema never sanitized.
  it('clears a stale key mapping when a slug is re-wrapped with a clean schema', async () => {
    const provider = new AnthropicProvider();
    const executeToolFn = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null, successful: true });
    provider._setExecuteToolFn(executeToolFn);

    // First wrap registers a `dollar_top -> $top` mapping for this slug.
    provider.wrapTool(odataTool);

    // Re-wrap the SAME slug with a schema that has no illegal keys.
    const cleanedTool: Tool = {
      ...odataTool,
      inputParameters: { type: 'object', properties: { dollar_top: { type: 'integer' } } },
    } as unknown as Tool;
    provider.wrapTool(cleanedTool);

    // The model now legitimately sends `dollar_top`; it must reach the backend
    // unchanged rather than being restored to `$top` by the stale mapping.
    await provider.executeToolCall('user-1', {
      type: 'tool_use',
      id: 'tu_5',
      name: odataTool.slug,
      input: { dollar_top: 7 },
    });

    const [, payload] = executeToolFn.mock.calls[0];
    expect(payload.arguments).toEqual({ dollar_top: 7 });
  });

  // `wrapTool` dereferences `$ref`/`$defs` before sanitizing, so an illegal key
  // reachable only through a reference is both made compliant for Anthropic and
  // restored to its original name at execution time.
  it('dereferences $ref so $ref-nested illegal keys round-trip', async () => {
    const provider = new AnthropicProvider();
    const executeToolFn = vi
      .fn()
      .mockResolvedValue({ data: { ok: true }, error: null, successful: true });
    provider._setExecuteToolFn(executeToolFn);

    const refTool: Tool = {
      slug: 'ref-tool',
      name: 'Ref',
      description: 'uses $ref into $defs',
      inputParameters: {
        type: 'object',
        properties: { filter: { $ref: '#/$defs/Filter' } },
        $defs: { Filter: { type: 'object', properties: { $top: { type: 'integer' } } } },
      },
      tags: [],
    } as unknown as Tool;

    const wrapped = provider.wrapTool(refTool) as AnthropicTool;
    // The $ref is inlined, `$defs` removed, and the nested `$top` sanitized.
    expect((wrapped.input_schema.properties as any).filter.properties).toHaveProperty('dollar_top');
    expect((wrapped.input_schema as any).$defs).toBeUndefined();

    await provider.executeToolCall('user-1', {
      type: 'tool_use',
      id: 'tu_ref',
      name: 'ref-tool',
      input: { filter: { dollar_top: 3 } },
    });

    const [, payload] = executeToolFn.mock.calls[0];
    expect(payload.arguments).toEqual({ filter: { $top: 3 } });
  });
});
