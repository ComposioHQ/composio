/**
 * `$ref` / `$defs` handling contract for OpenAIAgentsProvider.
 *
 * `wrapTool` has two independent branches with *opposite* correct behavior,
 * and nothing previously pinned either of them:
 *
 *  - the strict-structured-outputs branch must **keep** local `$ref`/`$defs`.
 *    OpenAI supports them natively, including recursion, and
 *    `toStrictJsonSchema` preserves them on purpose (see
 *    `ts/packages/core/src/utils/jsonSchema.ts`, "local `$ref`s into
 *    `$defs`/`definitions` are kept"). Inlining first would delete recursion
 *    support and multiply a shared `$def` against OpenAI's schema size caps.
 *  - the non-strict fallback rebuilds the root from `properties`/`required`,
 *    which drops `$defs` while leaving `$ref` pointers inside `properties`.
 *    That branch must therefore dereference *before* the rebuild.
 *
 * A change that "helpfully" dereferences everything up front satisfies the
 * second requirement and silently violates the first. These tests exist to
 * make that failure loud.
 *
 * Regenerated 2026-08-28 after the original was lost in a session handoff.
 * The non-strict "resolves `$ref`" case below began life as an `it.fails`
 * ratchet while the fallback still stranded pointers; landing
 * `fix/deref-ref-schemas-in-providers` flipped it to a plain `it`, exactly as
 * the ratchet's instructions required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAgentsProvider } from '../src';
import { Tool, ExecuteToolFn } from '@composio/core';

interface MockedOpenAIAgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
  execute: Function;
}

vi.mock('@openai/agents', () => ({
  tool: vi.fn().mockImplementation(toolConfig => ({ ...toolConfig })),
}));

/** True when any node carries a `$ref` pointing inside this document. */
const containsInternalRef = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsInternalRef);
  const node = value as Record<string, unknown>;
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) return true;
  return Object.values(node).some(containsInternalRef);
};

const baseTool: Tool = {
  slug: 'REF_TOOL',
  name: 'Ref Tool',
  description: 'Tool whose schema reaches a property through $ref',
  version: '20260828_00',
  availableVersions: ['20260828_00'],
  tags: [],
  inputParameters: {
    type: 'object',
    properties: { message: { $ref: '#/$defs/Message' } },
    required: ['message'],
    $defs: {
      Message: {
        type: 'object',
        properties: { subject: { type: 'string' }, body: { type: 'string' } },
        required: ['subject', 'body'],
      },
    },
  },
} as unknown as Tool;

/** GMAIL_FETCH_EMAILS shape: a `$ref` into `$defs` that was never declared. */
const danglingTool: Tool = {
  ...baseTool,
  slug: 'DANGLING_REF_TOOL',
  inputParameters: {
    type: 'object',
    properties: { message: { $ref: '#/$defs/Message' } },
    required: ['message'],
  },
} as unknown as Tool;

/** A legitimately recursive schema — no finite inlined form exists. */
const recursiveTool: Tool = {
  ...baseTool,
  slug: 'RECURSIVE_REF_TOOL',
  inputParameters: {
    type: 'object',
    properties: { node: { $ref: '#/$defs/Node' } },
    required: ['node'],
    $defs: {
      Node: {
        type: 'object',
        properties: { label: { type: 'string' }, child: { $ref: '#/$defs/Node' } },
        required: ['label'],
      },
    },
  },
} as unknown as Tool;

describe('OpenAIAgentsProvider $ref handling', () => {
  let execute: ExecuteToolFn;

  beforeEach(() => {
    execute = vi.fn().mockResolvedValue({
      data: {},
      error: null,
      successful: true,
    }) as unknown as ExecuteToolFn;
    vi.clearAllMocks();
  });

  describe('strict mode must preserve references', () => {
    it('keeps $defs and the $ref pointer instead of inlining them', () => {
      const provider = new OpenAIAgentsProvider({ strict: true });
      provider._setExecuteToolFn(execute);

      const wrapped = provider.wrapTool(baseTool, execute) as unknown as MockedOpenAIAgentTool;

      expect(wrapped.strict).toBe(true);
      // The reference itself survives — OpenAI resolves it.
      expect(wrapped.parameters.properties).toEqual({ message: { $ref: '#/$defs/Message' } });
      // And the definition it points at travels with it.
      expect(wrapped.parameters.$defs).toBeDefined();
      expect((wrapped.parameters.$defs as Record<string, unknown>).Message).toMatchObject({
        type: 'object',
      });
    });

    it('keeps recursion expressible — a recursive $defs is not flattened', () => {
      const provider = new OpenAIAgentsProvider({ strict: true });
      provider._setExecuteToolFn(execute);

      const wrapped = provider.wrapTool(recursiveTool, execute) as unknown as MockedOpenAIAgentTool;

      // Dereferencing a recursive schema replaces the recursive branch with a
      // permissive `{ type: 'object', additionalProperties: true }` sentinel.
      // Strict mode must not pay that price: the self-reference stays intact.
      const defs = wrapped.parameters.$defs as Record<string, Record<string, unknown>> | undefined;
      expect(defs?.Node).toBeDefined();
      const child = (defs?.Node.properties as Record<string, unknown>).child;
      // `child` is optional, so strict mode widens it to an `anyOf` with a
      // null branch. What matters is that the self-reference survives at all —
      // an inlining pass would have replaced it with a permissive sentinel.
      expect(containsInternalRef(child)).toBe(true);
      expect(JSON.stringify(child)).toContain('#/$defs/Node');
    });

    it('falls back to non-strict on a dangling ref rather than throwing', () => {
      const provider = new OpenAIAgentsProvider({ strict: true });
      provider._setExecuteToolFn(execute);

      expect(() => provider.wrapTool(danglingTool, execute)).not.toThrow();
    });
  });

  describe('non-strict mode must not emit a dangling reference', () => {
    it('resolves $ref into a real property instead of stranding the pointer', () => {
      const provider = new OpenAIAgentsProvider();
      provider._setExecuteToolFn(execute);

      const wrapped = provider.wrapTool(baseTool, execute) as unknown as MockedOpenAIAgentTool;

      // The non-strict branch rebuilds `{ type, properties, required }`, so a
      // surviving `$ref` here would point at a `$defs` block that no longer
      // exists in the emitted schema.
      expect(containsInternalRef(wrapped.parameters)).toBe(false);
      expect(wrapped.parameters.required).toContain('message');

      const message = (wrapped.parameters.properties as Record<string, Record<string, unknown>>)
        .message;
      expect(message.type).toBe('object');
      expect(Object.keys(message.properties as object)).toEqual(['subject', 'body']);
    });

    it('does not throw when the schema references undeclared $defs', () => {
      const provider = new OpenAIAgentsProvider();
      provider._setExecuteToolFn(execute);

      expect(() => provider.wrapTool(danglingTool, execute)).not.toThrow();
    });
  });
});
