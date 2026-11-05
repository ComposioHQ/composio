/**
 * Regression test: `LlamaindexProvider.wrapTool` must dereference internal
 * `$ref`/`$defs` before handing the schema to `jsonSchemaToZodSchema`.
 * Without dereferencing, a `$ref`-typed property degrades to `z.any()` and
 * silently accepts any value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tool } from '@composio/core';
import { LlamaindexProvider } from '../src';

// Mock the llamaindex module (per-file scoping keeps this independent of llamaindex.test.ts).
vi.mock('llamaindex', () => {
  return {
    FunctionTool: class {
      constructor(
        readonly call: (input: unknown) => unknown,
        readonly metadata: { name: string; description: string; parameters: unknown },
        readonly zodType: unknown
      ) {}
    },
  };
});

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

describe('LlamaindexProvider regression: $ref in JSON Schema', () => {
  let provider: LlamaindexProvider;
  let executeToolFn: (toolSlug: string, params: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    provider = new LlamaindexProvider();
    executeToolFn = vi.fn().mockResolvedValue({ data: {}, error: null, successful: true });
  });

  it('validates arguments against the $defs-described shape', () => {
    const wrapped = provider.wrapTool(refTool, executeToolFn);
    const schema = (wrapped as unknown as { zodType: unknown }).zodType as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(schema.safeParse({ message: { subject: 's', body: 'b' } }).success).toBe(true);
    expect(schema.safeParse({ message: 42 }).success).toBe(false);
  });

  it('shows the model the schema with its definitions inlined', () => {
    const wrapped = provider.wrapTool(refTool, executeToolFn);

    expect(wrapped.metadata.parameters).toEqual({
      type: 'object',
      properties: {
        message: {
          type: 'object',
          properties: { subject: { type: 'string' }, body: { type: 'string' } },
          required: ['subject', 'body'],
          additionalProperties: false,
        },
      },
      required: ['message'],
    });
  });

  it('does not throw when $ref points into an undeclared $defs block', () => {
    expect(() => provider.wrapTool(danglingRefTool, executeToolFn)).not.toThrow();
  });

  it('does not throw on a self-referential $defs schema', () => {
    expect(() => provider.wrapTool(recursiveRefTool, executeToolFn)).not.toThrow();
  });
});
