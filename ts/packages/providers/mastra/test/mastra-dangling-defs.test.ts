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
import {
  logger,
  telemetry,
  type ExecuteToolFn,
  type Tool,
  type ToolExecuteResponse,
} from '@composio/core';
import { MastraProvider } from '../src';

// The fixtures below deliberately build `Tool`-shaped objects whose
// `inputParameters` / `outputParameters` carry `$ref` properties — a shape
// `ParametersSchema` admits via `JSONSchemaPropertySchema` but that does not
// satisfy the parent record type at the literal level. `makeTool` localizes
// the cast so individual fixtures stay readable.
type TestSchema = Record<string, unknown>;
type TestToolOverrides = Partial<Omit<Tool, 'inputParameters' | 'outputParameters'>> & {
  inputParameters?: TestSchema;
  outputParameters?: TestSchema;
};

const makeTool = (overrides: TestToolOverrides): Tool =>
  ({
    slug: 'TEST_TOOL',
    name: 'Test Tool',
    description: '',
    toolkit: { slug: 'test', name: 'Test' },
    version: '20260510_00',
    availableVersions: ['20260510_00'],
    tags: [],
    inputParameters: {
      type: 'object',
      properties: {},
    },
    outputParameters: {
      type: 'object',
      properties: {},
    },
    ...overrides,
  }) as unknown as Tool;

// Exact shape of `GMAIL_FETCH_EMAILS.outputParameters` from
// https://github.com/ComposioHQ/composio/issues/3307: a `$ref` into
// `#/$defs/...` with no `$defs` block declared anywhere.
const danglingOutputTool = makeTool({
  slug: 'DANGLING_OUTPUT_TOOL',
  name: 'Dangling Output Tool',
  description: 'Tool whose outputParameters carries a dangling $ref',
  toolkit: { slug: 'dangling', name: 'Dangling Toolkit' },
  inputParameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  outputParameters: {
    type: 'object',
    properties: {
      data: {
        description: 'Data from the action execution',
        title: 'Data',
        $ref: '#/$defs/FetchEmailsResponse',
      },
      error: { type: 'string', description: 'Error if the action failed', title: 'Error' },
      successful: {
        type: 'boolean',
        description: 'Whether the action was successful',
        title: 'Successful',
      },
    },
    required: ['data', 'successful'],
    title: 'FetchEmailsResponseWrapper',
  },
});

const danglingInputTool = makeTool({
  slug: 'DANGLING_INPUT_TOOL',
  name: 'Dangling Input Tool',
  toolkit: { slug: 'dangling', name: 'Dangling Toolkit' },
  inputParameters: {
    type: 'object',
    properties: { filter: { $ref: '#/$defs/UnknownFilter' } },
    required: ['filter'],
  },
  outputParameters: { type: 'object', properties: { ok: { type: 'boolean' } } },
});

const resolvableRefTool = makeTool({
  slug: 'RESOLVABLE_REF_TOOL',
  name: 'Resolvable Ref Tool',
  inputParameters: {
    type: 'object',
    properties: { user: { $ref: '#/$defs/User' } },
    required: ['user'],
    $defs: {
      User: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  outputParameters: { type: 'object', properties: { ok: { type: 'boolean' } } },
});

describe('MastraProvider: dangling $ref tolerance', () => {
  let provider: MastraProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let telemetrySpy: ReturnType<typeof vi.spyOn>;
  let exec: ExecuteToolFn;

  beforeEach(() => {
    provider = new MastraProvider();
    const mockExec = vi.fn<Parameters<ExecuteToolFn>, ReturnType<ExecuteToolFn>>(
      async () => ({ data: {}, error: null, successful: true }) as unknown as ToolExecuteResponse
    );
    exec = mockExec;
    provider._setExecuteToolFn(exec);
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    telemetrySpy = vi.spyOn(telemetry, 'sendMetric').mockResolvedValue(undefined);
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
    // User-controlled segments are JSON.stringified — they appear quoted in
    // the warn output (CWE-117 mitigation; see warnDanglingRefOnce).
    expect(message).toContain('"DANGLING_OUTPUT_TOOL"');
    expect(message).toContain('"dangling"');
    expect(message).toContain('"#/$defs/FetchEmailsResponse"');
    expect(message).toContain('github.com/ComposioHQ/composio/issues/3307');
  });

  it('emits a separate warning for a different tool slug carrying the same ref', () => {
    const sameRefDifferentSlug = makeTool({
      ...danglingOutputTool,
      slug: 'OTHER_DANGLING_OUTPUT_TOOL',
    });
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

  it('sanitizes control bytes / newlines / ANSI escapes in the warning (CWE-117 regression)', () => {
    // An upstream-shaped tool whose $ref carries a newline + ANSI CSI sequence.
    // Without JSON.stringify on the interpolated segments, these bytes would
    // be written verbatim to stderr, forging a fake log line.
    const malicious = makeTool({
      slug: 'MALICIOUS_TOOL',
      outputParameters: {
        type: 'object',
        properties: { data: { $ref: '#/$defs/Foo\n\x1b[31mFAKE LOG LINE\x1b[0m' } },
      },
    });
    provider.wrapTool(malicious, exec);
    const calls = warnSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('MALICIOUS_TOOL')
    );
    expect(calls).toHaveLength(1);
    const message = calls[0][0] as string;
    // Raw newline / escape bytes must NOT survive into the warning string.
    expect(message).not.toMatch(/[\x00-\x09\x0b-\x1f]/);
    // Escapes appear in their JSON-encoded form instead.
    expect(message).toContain('\\n');
    expect(message).toContain('\\u001b');
  });

  it('fires one telemetry event per (toolSlug, ref) pair next to the warn', () => {
    provider.wrapTool(danglingOutputTool, exec);
    provider.wrapTool(danglingOutputTool, exec); // dedup: still 1 event

    const calls = telemetrySpy.mock.calls.filter(([payload]) => {
      const events = payload as Array<{ functionName: string; props?: Record<string, unknown> }>;
      return events.some(e => e.functionName === 'composio.mastra.wrapTool.danglingRef');
    });
    expect(calls).toHaveLength(1);

    const event = (calls[0][0] as Array<Record<string, unknown>>)[0];
    expect(event.functionName).toBe('composio.mastra.wrapTool.danglingRef');
    expect(event.props).toMatchObject({
      toolSlug: 'DANGLING_OUTPUT_TOOL',
      toolkitSlug: 'dangling',
      ref: '#/$defs/FetchEmailsResponse',
      reason: 'missing-target',
    });
    expect(event.metadata).toEqual({ provider: 'mastra' });
  });

  it('does NOT fire telemetry for tools whose $refs all resolve', () => {
    provider.wrapTool(resolvableRefTool, exec);
    const calls = telemetrySpy.mock.calls.filter(([payload]) => {
      const events = payload as Array<{ functionName: string }>;
      return events.some(e => e.functionName === 'composio.mastra.wrapTool.danglingRef');
    });
    expect(calls).toHaveLength(0);
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
