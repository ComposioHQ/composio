/**
 * Regression test: `GoogleProvider.wrapTool` rebuilds the root schema from
 * `properties`/`required`, which used to discard the `$defs` block while
 * `$ref` pointers inside `properties` stayed dangling. The Google GenAI
 * `Schema` type has no `ref`/`defs` field, so a `$ref` on the `parameters`
 * path is unrepresentable and the API answers 400. `wrapTool` now
 * dereferences `$ref`/`$defs` before the rebuild.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Tool } from '@composio/core';
import { GoogleProvider } from '../src';

const containsInternalRef = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsInternalRef);
  const node = value as Record<string, unknown>;
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) return true;
  return Object.values(node).some(containsInternalRef);
};

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

describe('GoogleProvider regression: $ref in JSON Schema', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    provider = new GoogleProvider();
  });

  it('inlines internal $ref/$defs instead of stranding a dangling pointer', () => {
    const wrapped = provider.wrapTool(refTool);

    expect(containsInternalRef(wrapped.parameters)).toBe(false);
    expect(wrapped.parameters?.required).toContain('message');
  });

  it('does not throw when $ref points into an undeclared $defs block', () => {
    expect(() => provider.wrapTool(danglingRefTool)).not.toThrow();
  });

  it('does not throw on a self-referential $defs schema', () => {
    expect(() => provider.wrapTool(recursiveRefTool)).not.toThrow();
  });
});
