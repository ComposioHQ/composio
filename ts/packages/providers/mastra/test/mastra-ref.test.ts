/**
 * Regression test for the Mastra provider against the **real**
 * `@mastra/schema-compat` (no `vi.mock` for it). Without dereferencing,
 * `applyCompatLayer` silently degrades a `$ref`-typed property to a permissive
 * `anyOf` of all primitives — losing the type info from `$defs`. We assert
 * the post-wrap schemas preserve the structure described by `$defs`.
 *
 * Vitest mock scoping is per-file by default, so the top-level `vi.mock`
 * for `@mastra/schema-compat` in `mastra.test.ts` does not leak here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tool } from '@composio/core';
import { MastraProvider } from '../src';

const containsRef = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsRef);
  if ('$ref' in (value as Record<string, unknown>)) return true;
  return Object.values(value as Record<string, unknown>).some(containsRef);
};

const findProperty = (schema: unknown, key: string): Record<string, unknown> | undefined => {
  if (schema === null || typeof schema !== 'object') return undefined;
  for (const value of Object.values(schema as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findProperty(item, key);
        if (found) return found;
      }
    } else if (typeof value === 'object' && value !== null) {
      const props = value as Record<string, unknown> as Record<string, unknown>;
      if (key in props && typeof props[key] === 'object') {
        return props[key] as Record<string, unknown>;
      }
      const found = findProperty(value, key);
      if (found) return found;
    }
  }
  return undefined;
};

const refTool: Tool = {
  slug: 'PLEN_2244_TOOL',
  name: 'PLEN-2244 Tool',
  description: 'Tool whose schema carries internal $ref pointers',
  toolkit: { slug: 'plen2244', name: 'PLEN 2244' },
  version: '20260430_00',
  availableVersions: ['20260430_00'],
  tags: [],
  inputParameters: {
    type: 'object',
    properties: { user: { $ref: '#/$defs/User' } as never },
    required: ['user'],
    $defs: {
      User: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  } as unknown as Tool['inputParameters'],
  outputParameters: {
    type: 'object',
    properties: { item: { $ref: '#/definitions/Item' } as never },
    definitions: {
      Item: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
    },
  } as unknown as Tool['outputParameters'],
};

describe('MastraProvider regression: $ref in JSON Schema', () => {
  let wrapped: { inputSchema: unknown; outputSchema: unknown };

  beforeEach(() => {
    const provider = new MastraProvider();
    const exec = vi.fn().mockResolvedValue({ data: {}, error: null, successful: true });
    provider._setExecuteToolFn(exec);
    wrapped = provider.wrapTool(refTool, exec) as typeof wrapped;
  });

  it('preserves type info from $defs (no degraded permissive anyOf)', () => {
    const idProp = findProperty(wrapped.inputSchema, 'id');
    expect(idProp).toBeDefined();
    expect(idProp?.type).toBe('string');
  });

  it('preserves type info from Draft-7 `definitions` on the output schema', () => {
    const skuProp = findProperty(wrapped.outputSchema, 'sku');
    expect(skuProp).toBeDefined();
    expect(skuProp?.type).toBe('string');
  });

  it('leaves no $ref in the produced schemas', () => {
    expect(containsRef(wrapped.inputSchema)).toBe(false);
    expect(containsRef(wrapped.outputSchema)).toBe(false);
  });
});
