import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { experimental_createMCPClient as createMCPClient, stepCountIs, streamText } from 'ai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const externalUserId = '<extern_user_id>'; // Replace it with the user id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.experimental.mcp.create(`${Date.now()}`, {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
    },
  ],
  manuallyManageConnections: false,
});

// 3. Retrieve the MCP server instance for the user
const server = await composio.experimental.mcp.generate(externalUserId, mcpConfig.id);

const serverParams = new SSEClientTransport(new URL(server.url));

const mcpClient = await createMCPClient({
  name: 'composio-mcp-client',
  transport: serverParams,
});

// 5. Retrieve tools.
const tools = await mcpClient.tools();

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
