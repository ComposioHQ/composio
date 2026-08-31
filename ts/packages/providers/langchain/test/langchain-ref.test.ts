/**
 * Regression test: `LangchainProvider.wrapTool` must dereference internal
 * `$ref`/`$defs` before handing the schema to `jsonSchemaToZodSchema`.
 * Without dereferencing, a `$ref`-typed property degrades to `z.any()` and
 * silently accepts any value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tool } from '@composio/core';
import { LangchainProvider } from '../src';

const refTool: Tool = {
  slug: 'TEST_REF_TOOL',
  name: 'Ref Tool',
  description: 'Tool whose schema carries internal $ref pointers',
  toolkit: { slug: 'reftoolkit', name: 'Ref Toolkit' },
  version: '20260828_00',
  availableVersions: ['20260828_00'],
  tags: [],
  inputParameters: {
    type: 'object',
    properties: {
      message: { $ref: '#/$defs/Message' },
    },
    required: ['message'],
    $defs: {
      Message: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['subject', 'body'],
        additionalProperties: false,
      },
    },
  } as unknown as Tool['inputParameters'],
} as unknown as Tool;

// Same tool but with the $defs block deleted — GMAIL_FETCH_EMAILS style.
const danglingRefTool: Tool = {
  ...refTool,
  slug: 'TEST_DANGLING_REF_TOOL',
  inputParameters: {
    type: 'object',
    properties: {
      message: { $ref: '#/$defs/Message' },
    },
    required: ['message'],
  } as unknown as Tool['inputParameters'],
};

// A self-referential schema has no finite inlined form.
const recursiveRefTool: Tool = {
  ...refTool,
  slug: 'TEST_RECURSIVE_REF_TOOL',
  inputParameters: {
    type: 'object',
    properties: {
      node: { $ref: '#/$defs/Node' },
    },
    required: ['node'],
    $defs: {
      Node: {
        type: 'object',
        properties: {
          value: { type: 'string' },
          child: { $ref: '#/$defs/Node' },
        },
        required: ['value'],
      },
    },
  } as unknown as Tool['inputParameters'],
};

describe('LangchainProvider regression: $ref in JSON Schema', () => {
  let provider: LangchainProvider;
  let executeToolFn: (toolSlug: string, params: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    provider = new LangchainProvider();
    executeToolFn = vi.fn().mockResolvedValue({ data: {}, error: null, successful: true });
  });

  it('produces a Zod schema that validates the $defs-described shape', () => {
    const wrapped = provider.wrapTool(refTool, executeToolFn);
    const schema = wrapped.schema as { safeParse: (value: unknown) => { success: boolean } };

    expect(schema.safeParse({ message: { subject: 's', body: 'b' } }).success).toBe(true);
    // Before the fix, $ref degraded to z.any() and this would have passed.
    expect(schema.safeParse({ message: 42 }).success).toBe(false);
  });

  it('does not throw when $ref points into an undeclared $defs block', () => {
    expect(() => provider.wrapTool(danglingRefTool, executeToolFn)).not.toThrow();
  });

  it('does not throw on a self-referential $defs schema', () => {
    expect(() => provider.wrapTool(recursiveRefTool, executeToolFn)).not.toThrow();
  });
});
