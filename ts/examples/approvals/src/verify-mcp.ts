/** Run the actual MCP example client against staging without a model. */
import assert from 'node:assert/strict';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createApprovalClient } from './mcp-client';
import { approvalTools, createComposio, multiArguments } from './session';
import { assertBatch, assertDenied } from './verification';

const composio = createComposio();
for (const elicitation of [true, false]) {
  const session = await composio.create(`approvals-mcp-ci-${crypto.randomUUID()}`, {
    mcp: true,
    toolkits: ['hackernews'],
    tools: { hackernews: { enable: approvalTools, requireApproval: approvalTools } },
    sandbox: { enable: false },
    experimental: { noElicitationSupportFallback: 'deny' },
  });
  let prompts = 0;
  const client = createApprovalClient(
    elicitation
      ? async () => {
          assert.ok(++prompts <= 2, 'MCP approval did not resolve');
          return { action: 'accept', content: { decision: 'approve' } };
        }
      : undefined
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(session.mcp.url), {
        requestInit: { headers: session.mcp.headers },
      })
    );
    const result = CallToolResultSchema.parse(
      await client.callTool({ name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: multiArguments })
    );
    assert.equal(prompts, elicitation ? 2 : 0);
    const text = result.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
    if (!elicitation && result.isError) {
      assertDenied(text);
    } else {
      assertBatch(
        result.structuredContent ?? JSON.parse(text),
        elicitation ? 2 : 0,
        elicitation ? 0 : 2
      );
    }
    console.log(`PASS MCP ${elicitation ? 'elicitation' : 'deny fallback'}`);
  } finally {
    try {
      await client.close();
    } finally {
      await composio.sessions.delete(session.sessionId);
    }
  }
}
