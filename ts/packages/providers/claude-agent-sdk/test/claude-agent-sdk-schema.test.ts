/**
 * The schema the provider shows the model through the Claude Agent SDK, and
 * the validation the SDK runs on tool-call arguments, both driven through the
 * real SDK over an in-memory MCP transport.
 */
import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { Tool, GlobalExecuteToolFn } from '@composio/core';
import { ClaudeAgentSDKProvider } from '../src';
import {
  acceptedFor,
  loadObjectCases,
} from '../../../core/test/fixtures/json-schema-conversion/corpus';

type Json = Record<string, unknown>;

const buildTool = (inputParameters: Json): Tool =>
  ({
    slug: 'TEST_TOOL',
    name: 'Test Tool',
    description: 'A tool under test',
    version: '20260901_00',
    availableVersions: ['20260901_00'],
    tags: [],
    inputParameters,
  }) as unknown as Tool;

const register = async (composioTool: Tool) => {
  const executeToolFn = vi.fn().mockResolvedValue({
    data: {},
    error: null,
    successful: true,
  }) as unknown as GlobalExecuteToolFn;
  const provider = new ClaudeAgentSDKProvider();
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
    client,
    inputSchema: tools[0].inputSchema as Json,
    accepts: async (args: unknown) => {
      const result = (await client.callTool({
        name: composioTool.slug,
        arguments: args as Record<string, unknown>,
      })) as { isError?: boolean };
      return !(result.isError ?? false);
    },
  };
};

describe('ClaudeAgentSDKProvider schema sent to the model', () => {
  it('sends the source keywords a v3 Zod schema could not carry', async () => {
    const { client, inputSchema } = await register(
      buildTool({
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary' },
          hex: {
            type: 'string',
            contentEncoding: 'base16',
            contentMediaType: 'application/octet-stream',
          },
          count: { type: 'integer', minimum: 0 },
        },
        required: ['file'],
      })
    );
    await client.close();
    const properties = inputSchema.properties as Record<string, Json>;

    expect(properties.file).toEqual({ type: 'string', format: 'binary' });
    expect(properties.hex).toEqual({
      type: 'string',
      contentEncoding: 'base16',
      contentMediaType: 'application/octet-stream',
    });
    expect(properties.count).toMatchObject({ type: 'integer', minimum: 0 });
  });

  it('keeps a defaulted field optional and shows its default', async () => {
    const { client, inputSchema, accepts } = await register(
      buildTool({
        type: 'object',
        properties: {
          query: { type: 'string' },
          page: { type: 'integer', default: 1 },
        },
        required: ['query'],
      })
    );
    const acceptsWithoutPage = await accepts({ query: 'q' });
    await client.close();

    expect(inputSchema.required).toEqual(['query']);
    expect((inputSchema.properties as Record<string, Json>).page).toMatchObject({
      type: 'integer',
      default: 1,
    });
    expect(acceptsWithoutPage).toBe(true);
  });
});

describe('ClaudeAgentSDKProvider tool-call validation', () => {
  for (const testCase of loadObjectCases()) {
    it(`matches the shared corpus on ${testCase.id}`, async () => {
      const { client, accepts } = await register(buildTool(testCase.schema));

      for (const instance of testCase.instances) {
        expect(await accepts(instance.input), JSON.stringify(instance.input)).toBe(
          acceptedFor(instance, 'zod')
        );
      }
      await client.close();
    });
  }
});
