import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { experimental_createMCPClient as createMCPClient, stepCountIs, streamText } from 'ai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// 2. Create an MCP session
console.log('🔄 Creating toolrouter session...');
const mcp = await composio.experimental.toolRouter.createSession('default', {
  toolkits: ['gmail', 'hackernews', 'github'],
});

console.log(JSON.stringify(mcp, null, 2));


console.log(`✅ Toolrouter session created: ${mcp.sessionId}`);
console.log(`🔄 Connecting to MCP Server: ${mcp.url}`);

const serverParams = new StreamableHTTPClientTransport(new URL(mcp.url));

const mcpClient = await createMCPClient({
  name: 'composio-mcp-client',
  transport: serverParams,
});

// 5. Retrieve tools.
console.log(`🔄 Retrieving tools...`);
const tools = await mcpClient.tools();
console.log(`✅ Tools Retrieved`);
Object.keys(tools).map(tool => console.log(`  📦 ${tool}`));

// 6. Pass tools to Vercel-specific Agent.
console.log(`🔄 Executing agent...`);
const stream = streamText({
  model: openai('gpt-4o-mini'),
  messages: [
    {
      role: 'user',
      content: `What's latest on hackernews?`,
    },
  ],
  stopWhen: stepCountIs(5),
  tools,
});
console.log(`🤖 Agent Response:`);
// 7. Execute the Vercel AI-specific Agent.
for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

// 8. Close Vercel AI's MCP client.
await mcpClient.close();
