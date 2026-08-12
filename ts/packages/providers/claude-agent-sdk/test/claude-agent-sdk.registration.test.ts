/**
 * Registration boundary tests for the Claude Agent SDK provider.
 *
 * The sibling suite mocks `tool()`, which proves what the provider *passes* but not what the SDK
 * *does* with it. Root object constraints are precisely the part a mock cannot check: they survive
 * or vanish inside `createSdkMcpServer`, when the registered Zod schema is projected to the JSON
 * Schema the model sees and used to validate incoming arguments.
 *
 * These tests therefore drive the real SDK over an in-memory MCP transport and assert on the
 * emitted `inputSchema` and on real `tools/call` results.
 */
import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { Tool, GlobalExecuteToolFn } from '@composio/core';
import { ClaudeAgentSDKProvider } from '../src';

type ToolCallResult = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

const buildTool = (inputParameters: Tool['inputParameters']): Tool =>
  ({
    slug: 'TEST_TOOL',
    name: 'Test Tool',
    description: 'A tool under test',
    version: '20250909_00',
    availableVersions: ['20250909_00'],
    inputParameters,
    tags: [],
  }) as Tool;

/**
 * Register one Composio tool through the provider and connect a real MCP client to it.
 *
 * Returns the tool's advertised input schema plus a `call` helper, so each test can assert on both
 * what the model is shown and what actually reaches execution.
 */
const registerTool = async (composioTool: Tool) => {
  const executeToolFn = vi.fn().mockResolvedValue({
    data: { result: 'success' },
    error: null,
    successful: true,
  }) as unknown as GlobalExecuteToolFn;

  const provider = new ClaudeAgentSDKProvider();
  provider._setExecuteToolFn(executeToolFn);

  const server = createSdkMcpServer({
    name: 'composio-test',
    version: '1.0.0',
    tools: [provider.wrapTool(composioTool, executeToolFn)],
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await server.instance.server.connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();

  return {
    executeToolFn,
    inputSchema: tools[0].inputSchema as Record<string, unknown>,
    call: (args: Record<string, unknown>) =>
      client.callTool({ name: composioTool.slug, arguments: args }) as Promise<ToolCallResult>,
  };
};

describe('ClaudeAgentSDKProvider registration boundary', () => {
  it('carries a free-form object argument through registration and execution intact', async () => {
    const { inputSchema, executeToolFn, call } = await registerTool(
      buildTool({
        type: 'object',
        properties: { dataset_query: { type: 'object' } },
        required: ['dataset_query'],
      })
    );

    expect(inputSchema.properties).toMatchObject({ dataset_query: { type: 'object' } });

    const dataset_query = { database: 1, query: { 'source-table': 2, aggregation: [['count']] } };
    const result = await call({ dataset_query });

    expect(result.isError ?? false).toBe(false);
    expect(executeToolFn).toHaveBeenCalledWith(
      'TEST_TOOL',
      expect.objectContaining({ dataset_query })
    );
  });

  it('rejects an unknown key instead of silently dropping it', async () => {
    // A raw property shape cannot express a root `additionalProperties`, so the SDK stripped
    // unknown keys and executed anyway. Registering the complete schema makes the root strict.
    const { inputSchema, executeToolFn, call } = await registerTool(
      buildTool({
        type: 'object',
        properties: { to: { type: 'string' } },
        required: ['to'],
      })
    );

    expect(inputSchema.additionalProperties).toBe(false);

    const result = await call({ to: 'someone@example.com', hallucinated: 'value' });

    expect(result.isError).toBe(true);
    expect(executeToolFn).not.toHaveBeenCalled();
  });

  it('preserves root patternProperties so matching keys are accepted and validated', async () => {
    const { executeToolFn, call } = await registerTool(
      buildTool({
        type: 'object',
        properties: {},
        patternProperties: { '^meta_': { type: 'string' } },
      })
    );

    const accepted = await call({ meta_source: 'crm' });
    expect(accepted.isError ?? false).toBe(false);
    expect(executeToolFn).toHaveBeenCalledWith(
      'TEST_TOOL',
      expect.objectContaining({ meta_source: 'crm' })
    );

    executeToolFn.mockClear();

    const rejected = await call({ meta_source: 42 });
    expect(rejected.isError).toBe(true);
    expect(executeToolFn).not.toHaveBeenCalled();
  });

  it('preserves schema-valued additionalProperties through MCP registration', async () => {
    const { inputSchema, executeToolFn, call } = await registerTool(
      buildTool({
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: { type: 'number' },
      })
    );

    expect(inputSchema.additionalProperties).toEqual({ type: 'number' });

    const accepted = await call({ name: 'report', count: 2 });
    expect(accepted.isError ?? false).toBe(false);
    expect(executeToolFn).toHaveBeenCalledWith(
      'TEST_TOOL',
      expect.objectContaining({ name: 'report', count: 2 })
    );

    executeToolFn.mockClear();

    const rejected = await call({ name: 'report', count: 'two' });
    expect(rejected.isError).toBe(true);
    expect(executeToolFn).not.toHaveBeenCalled();
  });

  it('keeps a tool with no input parameters closed', async () => {
    const { inputSchema, executeToolFn, call } = await registerTool(buildTool(undefined));

    expect(inputSchema.additionalProperties).toBe(false);

    const result = await call({ unexpected: 'value' });

    expect(result.isError).toBe(true);
    expect(executeToolFn).not.toHaveBeenCalled();
  });
});
