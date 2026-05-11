/**
 * Regression test for https://github.com/ComposioHQ/composio/issues/3307 —
 * the Composio API ships some `outputParameters` with a `$ref` into
 * `#/$defs/...` while never declaring `$defs` (e.g., `GMAIL_FETCH_EMAILS`).
 * The strict `dereferenceJsonSchema` throws on this, which cascades through
 * `MastraProvider.wrapTool` and crashes `tools.get` upfront.
 *
 * `MastraProvider` opts the dereferencer into `onUnresolved: 'sentinel'`,
 * replacing dangling internal refs with the cycle-break sentinel
 * (`{ type: 'object', additionalProperties: true }`) and emitting one
 * `logger.warn` per `(toolSlug, ref)` pair.
 *
 * Like `mastra-ref.test.ts`, this file deliberately does NOT mock
 * `@mastra/schema-compat` — Vitest mock scoping is per-file, so the mock in
 * `mastra.test.ts` does not leak here, and the test exercises the real
 * AJV-backed compat layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, type Tool } from '@composio/core';
import { MastraProvider } from '../src';

// Exact shape of `GMAIL_FETCH_EMAILS.outputParameters` from
// https://github.com/ComposioHQ/composio/issues/3307: a `$ref` into
// `#/$defs/...` with no `$defs` block declared anywhere.
const danglingOutputTool: Tool = {
  slug: 'DANGLING_OUTPUT_TOOL',
  name: 'Dangling Output Tool',
  description: 'Tool whose outputParameters carries a dangling $ref',
  toolkit: { slug: 'dangling', name: 'Dangling Toolkit' },
  version: '20260510_00',
  availableVersions: ['20260510_00'],
  tags: [],
  inputParameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  } as unknown as Tool['inputParameters'],
  outputParameters: {
    type: 'object',
    properties: {
      data: {
        description: 'Data from the action execution',
        title: 'Data',
        $ref: '#/$defs/FetchEmailsResponse',
      },
      error: {
        type: 'string',
        description: 'Error if the action failed',
        title: 'Error',
      },
      successful: {
        type: 'boolean',
        description: 'Whether the action was successful',
        title: 'Successful',
      },
    },
    required: ['data', 'successful'],
    title: 'FetchEmailsResponseWrapper',
  } as unknown as Tool['outputParameters'],
};

const danglingInputTool: Tool = {
  ...danglingOutputTool,
  slug: 'DANGLING_INPUT_TOOL',
  name: 'Dangling Input Tool',
  inputParameters: {
    type: 'object',
    properties: {
      filter: { $ref: '#/$defs/UnknownFilter' },
    },
    required: ['filter'],
  } as unknown as Tool['inputParameters'],
  outputParameters: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
  } as unknown as Tool['outputParameters'],
};

const resolvableRefTool: Tool = {
  ...danglingOutputTool,
  slug: 'RESOLVABLE_REF_TOOL',
  name: 'Resolvable Ref Tool',
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
    properties: { ok: { type: 'boolean' } },
  } as unknown as Tool['outputParameters'],
};

describe('MastraProvider: dangling $ref tolerance', () => {
  let provider: MastraProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exec: any;

  beforeEach(() => {
    provider = new MastraProvider();
    exec = vi.fn().mockResolvedValue({ data: {}, error: null, successful: true });
    provider._setExecuteToolFn(exec);
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  it('does not throw when outputParameters has a $ref with no $defs declared (GMAIL_FETCH_EMAILS shape)', () => {
    expect(() => provider.wrapTool(danglingOutputTool, exec)).not.toThrow();
  });

  it('produces a defined outputSchema with the dangling branch replaced by a permissive object', () => {
    const wrapped = provider.wrapTool(danglingOutputTool, exec) as {
      outputSchema: unknown;
    };
    expect(wrapped.outputSchema).toBeDefined();
    // The wrapped schema went through applyCompatLayer (JSON Schema → Zod →
    // JSON Schema). All we can guarantee at this level is no surviving
    // $ref string anywhere in the structure.
    expect(JSON.stringify(wrapped.outputSchema)).not.toContain('$ref');
  });

  it('emits exactly one logger.warn per (toolSlug, ref) pair, even when the same tool is wrapped multiple times', () => {
    provider.wrapTool(danglingOutputTool, exec);
    provider.wrapTool(danglingOutputTool, exec);
    provider.wrapTool(danglingOutputTool, exec);

    const calls = warnSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('#/$defs/FetchEmailsResponse')
    );
    expect(calls).toHaveLength(1);
    const message = calls[0][0] as string;
    expect(message).toContain('DANGLING_OUTPUT_TOOL');
    expect(message).toContain('dangling');
    expect(message).toContain('github.com/ComposioHQ/composio/issues/3307');
  });

  it('emits a separate warning for a different tool slug carrying the same ref', () => {
    const sameRefDifferentSlug: Tool = {
      ...danglingOutputTool,
      slug: 'OTHER_DANGLING_OUTPUT_TOOL',
    };
    provider.wrapTool(danglingOutputTool, exec);
    provider.wrapTool(sameRefDifferentSlug, exec);

    const calls = warnSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('#/$defs/FetchEmailsResponse')
    );
    expect(calls).toHaveLength(2);
  });

  it('tolerates a dangling $ref on inputParameters (symmetric with output)', () => {
    expect(() => provider.wrapTool(danglingInputTool, exec)).not.toThrow();
    const calls = warnSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('#/$defs/UnknownFilter')
    );
    expect(calls).toHaveLength(1);
  });

  it('preserves resolvable $defs (regression guard — no degraded permissive anyOf)', () => {
    const wrapped = provider.wrapTool(resolvableRefTool, exec) as { inputSchema: unknown };
    // Resolvable $ref should produce a real schema with the User shape inlined.
    const inputJson = JSON.stringify(wrapped.inputSchema);
    expect(inputJson).toContain('id');
    expect(inputJson).not.toContain('$ref');
    // No warning should be emitted for resolvable refs.
    const calls = warnSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('$ref')
    );
    expect(calls).toHaveLength(0);
  });
});
