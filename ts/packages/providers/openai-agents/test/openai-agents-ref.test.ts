/**
 * Regression test: `OpenAIAgentsProvider.wrapTool`'s non-strict fallback
 * rebuilds the root schema from `properties`/`required`, which used to
 * discard the `$defs` block while `$ref` pointers inside `properties`
 * stayed dangling. `wrapTool` now dereferences `$ref`/`$defs` before that
 * rebuild.
 *
 * The strict branch is intentionally different: OpenAI's structured outputs
 * support `$defs`/`$ref` natively, including recursion, so `toStrictJsonSchema`
 * keeps local refs rather than inlining them. This file also guards that the
 * strict branch stays untouched by the fix applied to the fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tool, ExecuteToolFn } from '@composio/core';
import { OpenAIAgentsProvider } from '../src';

interface MockedOpenAIAgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
  execute: Function;
  _isMockedOpenAIAgentTool: boolean;
}

// Mock the @openai/agents module (per-file scoping keeps this independent of
// openai-agents.test.ts).
vi.mock('@openai/agents', () => {
  return {
    tool: vi.fn().mockImplementation(toolConfig => {
      return {
        ...toolConfig,
        _isMockedOpenAIAgentTool: true,
      } as MockedOpenAIAgentTool;
    }),
  };
});

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

describe('OpenAIAgentsProvider regression: $ref in JSON Schema', () => {
  let provider: OpenAIAgentsProvider;
  let executeToolFn: ExecuteToolFn;

  beforeEach(() => {
    provider = new OpenAIAgentsProvider();
    executeToolFn = vi.fn().mockResolvedValue({
      data: {},
      error: null,
      successful: true,
    }) as unknown as ExecuteToolFn;
    vi.clearAllMocks();
  });

  describe('non-strict fallback (bucket B fix)', () => {
    it('inlines internal $ref/$defs instead of stranding a dangling pointer', () => {
      const wrapped = provider.wrapTool(refTool, executeToolFn) as unknown as MockedOpenAIAgentTool;

      expect(containsInternalRef(wrapped.parameters)).toBe(false);
      expect(wrapped.parameters.required).toContain('message');
    });

    it('does not throw when $ref points into an undeclared $defs block', () => {
      expect(() => provider.wrapTool(danglingRefTool, executeToolFn)).not.toThrow();
    });

    it('does not throw on a self-referential $defs schema', () => {
      expect(() => provider.wrapTool(recursiveRefTool, executeToolFn)).not.toThrow();
    });
  });

  describe('strict branch (must stay untouched)', () => {
    it('keeps $defs and the $ref pointer intact under strict mode', () => {
      const strictProvider = new OpenAIAgentsProvider({ strict: true });
      const wrapped = strictProvider.wrapTool(
        refTool,
        executeToolFn
      ) as unknown as MockedOpenAIAgentTool;

      expect(wrapped.strict).toBe(true);
      expect(containsInternalRef(wrapped.parameters)).toBe(true);
      expect(wrapped.parameters.$defs).toBeDefined();
    });
  });
});
