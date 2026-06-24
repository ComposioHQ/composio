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
});
