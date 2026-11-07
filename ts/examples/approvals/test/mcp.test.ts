import { expect, test } from 'bun:test';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createApprovalClient } from '../src/mcp-client';
import { type ToolRouterInputResponse } from '@composio/core';

const answers: ToolRouterInputResponse[] = [
  { action: 'accept', content: { decision: 'approve' } },
  { action: 'accept', content: { decision: 'deny' } },
  { action: 'decline' },
  { action: 'cancel' },
];

test.each(answers)('MCP forwards the elicitation answer %j', async answer => {
  const server = new Server(
    { name: 'approval-test', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(CallToolRequestSchema, async () => {
    const response = await server.elicitInput({
      mode: 'form',
      message: 'Allow the read-only call?',
      requestedSchema: {
        type: 'object',
        properties: { decision: { type: 'string', enum: ['approve', 'deny'] } },
        required: ['decision'],
      },
    });
    return { content: [{ type: 'text', text: JSON.stringify(response) }] };
  });
  let prompts = 0;
  const client = createApprovalClient(async question => {
    prompts++;
    expect(question.message).toBe('Allow the read-only call?');
    expect(question.requestedSchema).toHaveProperty('properties.decision');
    return answer;
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'read', arguments: {} });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(answer) }]);
    expect(prompts).toBe(1);
  } finally {
    await client.close();
    await server.close();
  }
});

test('a client without a handler does not advertise elicitation support', async () => {
  const server = new Server({ name: 'approval-test', version: '1.0.0' }, { capabilities: {} });
  const client = createApprovalClient();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expect(server.getClientCapabilities()?.elicitation).toBeUndefined();
  } finally {
    await client.close();
    await server.close();
  }
});
