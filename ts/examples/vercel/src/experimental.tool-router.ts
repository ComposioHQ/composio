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

const authConfigId = 'ac__mmoU74SM1D-'; // Use your auth config ID
const externalUserId = 'default'; // Replace it with the user id

// 2. Create an MCP session
const mcp = await composio.experimental.toolRouter.createSession(externalUserId, {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
    },
  ],
});

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
console.log(`✅ Tools Retrieved`)
console.log(JSON.stringify(tools, null, 2));

// 6. Pass tools to Vercel-specific Agent.
const stream = streamText({
  model: openai('gpt-4o-mini'),
  messages: [
    {
      role: 'user',
      content: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email.`,
    },
  ],
  stopWhen: stepCountIs(5),
  tools,
});

// 7. Execute the Vercel AI-specific Agent.
for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

// 8. Close Vercel AI's MCP client.
await mcpClient.close();
