import * as readline from 'node:readline/promises';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { askForApproval } from './approval';
import { createApprovalClient } from './mcp-client';
import { approvalTools, createComposio, multiArguments } from './session';

const composio = createComposio();
const session = await composio.create(`approvals-mcp-${crypto.randomUUID()}`, {
  mcp: true,
  toolkits: ['hackernews'],
  tools: { hackernews: { enable: approvalTools, requireApproval: approvalTools } },
  sandbox: { enable: false },
  experimental: { noElicitationSupportFallback: 'deny' },
});
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
// Omit the handler and capability to demonstrate the deny fallback.
const client = createApprovalClient(
  process.argv.includes('--no-elicitation')
    ? undefined
    : question => askForApproval(question, prompt => terminal.question(prompt))
);
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(session.mcp.url), {
      requestInit: { headers: session.mcp.headers },
    })
  );
  const result = await client.callTool({
    name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
    arguments: multiArguments,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  terminal.close();
  try {
    await client.close();
  } finally {
    await composio.sessions.delete(session.sessionId);
  }
}
