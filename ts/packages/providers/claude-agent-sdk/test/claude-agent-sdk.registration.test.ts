import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { type GlobalExecuteToolFn, type JSONSchemaProperty, type Tool } from '@composio/core';
import { ClaudeAgentSDKProvider } from '../src';

type SdkMcpServer = ReturnType<typeof createSdkMcpServer>;
type ServerTransport = Parameters<SdkMcpServer['instance']['connect']>[0];
type JsonRpcMessage = Parameters<ServerTransport['send']>[0];

const connectedServers: SdkMcpServer[] = [];

type RootInputSchema = JSONSchemaProperty & {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
};

function createToolHarness(inputParameters: RootInputSchema | undefined) {
  const provider = new ClaudeAgentSDKProvider();
  const executeTool: Mock<GlobalExecuteToolFn> = vi.fn().mockResolvedValue({
    data: { result: 'success' },
    error: null,
    successful: true,
  });
  const wrappedTool = provider.wrapTool(
    {
      slug: 'ROOT_SCHEMA_TEST',
      name: 'Root schema test',
      description: 'Exercise root object schema behavior',
      version: '20260806_00',
      availableVersions: ['20260806_00'],
      // The Tool root type has not yet caught up with the recursive JSON Schema property type.
      inputParameters: inputParameters as Tool['inputParameters'],
      tags: ['test'],
    },
    executeTool
  );
  const server = createSdkMcpServer({ name: 'root-schema-test', tools: [wrappedTool] });
  connectedServers.push(server);

  let requestId = 0;
  let resolveResponse: ((message: JsonRpcMessage) => void) | undefined;
  const transport: ServerTransport = {
    start: async () => {},
    send: async message => resolveResponse?.(message),
    close: async () => transport.onclose?.(),
  };

  return {
    executeTool,
    async connect() {
      await server.instance.connect(transport);
    },
    async call(arguments_: Record<string, unknown>) {
      const id = ++requestId;
      const response = new Promise<JsonRpcMessage>(resolve => {
        resolveResponse = resolve;
      });
      const request: JsonRpcMessage = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'ROOT_SCHEMA_TEST', arguments: arguments_ },
      };
      transport.onmessage?.(request);
      return response;
    },
  };
}

afterEach(async () => {
  await Promise.all(connectedServers.splice(0).map(server => server.instance.close()));
});

describe('Claude Agent SDK root schema registration', () => {
  it('rejects unexpected arguments when the tool has no input schema', async () => {
    const harness = createToolHarness(undefined);
    await harness.connect();

    const response = await harness.call({ unexpected: true });

    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Input validation error') }],
      },
    });
  });

  it('preserves unknown fields when additionalProperties is true', async () => {
    const harness = createToolHarness({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: true,
    });
    await harness.connect();

    await harness.call({ name: 'Ada', score: 42 });

    expect(harness.executeTool).toHaveBeenCalledWith('ROOT_SCHEMA_TEST', {
      name: 'Ada',
      score: 42,
    });
  });

  it('preserves and validates schema-valued additional properties', async () => {
    const harness = createToolHarness({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: { type: 'number' },
    });
    await harness.connect();

    await harness.call({ name: 'Ada', score: 42 });
    expect(harness.executeTool).toHaveBeenCalledWith('ROOT_SCHEMA_TEST', {
      name: 'Ada',
      score: 42,
    });

    harness.executeTool.mockClear();
    const response = await harness.call({ name: 'Ada', score: 'high' });
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Input validation error') }],
      },
    });
  });

  it('rejects unknown fields when additionalProperties is false', async () => {
    const harness = createToolHarness({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
    await harness.connect();

    const response = await harness.call({ name: 'Ada', score: 42 });

    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Input validation error') }],
      },
    });
  });

  it('rejects unknown fields under the default strict policy', async () => {
    const harness = createToolHarness({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    await harness.connect();

    const response = await harness.call({ name: 'Ada', score: 42 });

    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Input validation error') }],
      },
    });
  });

  it('preserves patternProperties validation', async () => {
    const harness = createToolHarness({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      patternProperties: { '^metric_': { type: 'number' } },
      additionalProperties: false,
    });
    await harness.connect();

    await harness.call({ name: 'Ada', metric_score: 42 });
    expect(harness.executeTool).toHaveBeenCalledWith('ROOT_SCHEMA_TEST', {
      name: 'Ada',
      metric_score: 42,
    });

    harness.executeTool.mockClear();
    const response = await harness.call({ name: 'Ada', metric_score: 'high' });
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Input validation error') }],
      },
    });

    const unmatchedResponse = await harness.call({ name: 'Ada', other: 42 });
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(unmatchedResponse).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Input validation error') }],
      },
    });
  });
});
