/**
 * Regression test: `VercelProvider.wrapTool` must dereference internal
 * `$ref`/`$defs` before handing the schema to `jsonSchemaToZodSchema`, on
 * both the default and strict paths. Without dereferencing, a `$ref`-typed
 * property degrades to `z.any()` and silently accepts any value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tool } from '@composio/core';
import { VercelProvider } from '../src';

interface MockedVercelTool {
  description: string;
  inputSchema: unknown;
  execute: Function;
  _isMockedVercelTool: boolean;
}

/** The AI SDK schema the provider builds; `validate` runs the tool's Zod schema. */
type ValidatingSchema = { validate: (value: unknown) => Promise<{ success: boolean }> };

// Mock the ai module (per-file scoping keeps this independent of vercel.test.ts).
vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    tool: vi.fn().mockImplementation(toolConfig => {
      return {
        ...toolConfig,
        _isMockedVercelTool: true,
      } as MockedVercelTool;
    }),
    jsonSchema: actual.jsonSchema,
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

describe('VercelProvider regression: $ref in JSON Schema', () => {
  let provider: VercelProvider;
  let executeToolFn: (toolSlug: string, params: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    provider = new VercelProvider();
    executeToolFn = vi.fn().mockResolvedValue({ data: {}, error: null, successful: true });
    vi.clearAllMocks();
  });

  it('validates the $defs-described shape (default path)', async () => {
    const wrapped = provider.wrapTool(refTool, executeToolFn) as unknown as MockedVercelTool;
    const schema = wrapped.inputSchema as ValidatingSchema;

    expect((await schema.validate({ message: { subject: 's', body: 'b' } })).success).toBe(true);
    expect((await schema.validate({ message: 42 })).success).toBe(false);
  });

  it('validates the $defs-described shape (strict path)', async () => {
    const strictProvider = new VercelProvider({ strict: true });
    const wrapped = strictProvider.wrapTool(refTool, executeToolFn) as unknown as MockedVercelTool;
    const schema = wrapped.inputSchema as ValidatingSchema;

    expect((await schema.validate({ message: { subject: 's', body: 'b' } })).success).toBe(true);
    expect((await schema.validate({ message: 42 })).success).toBe(false);
  });

  it('does not throw when $ref points into an undeclared $defs block', () => {
    expect(() => provider.wrapTool(danglingRefTool, executeToolFn)).not.toThrow();
  });

  it('does not throw on a self-referential $defs schema', () => {
    expect(() => provider.wrapTool(recursiveRefTool, executeToolFn)).not.toThrow();
  });
});
