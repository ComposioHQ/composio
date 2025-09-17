import { openai } from '@ai-sdk/openai';
import { create as createComposio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { experimental_createMCPClient as createMCPClient, stepCountIs, streamText } from 'ai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
  experimental: {
    mcp: true,
  },
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const connectedAccountId = '<connected_account_id>'; // Replace it with the connected account id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.mcpConfig.create(
  `${Date.now()}`,
  [
    {
      // https://platform.composio.dev/alberto_schiabel/2025-09-12/auth-configs/ac_ydsgH6ZRO1Xc
      authConfigId,
      allowedTools,
    },
  ],
  { isChatAuth: true }
);

// 3. Retrieve the MCP server instance for the connected accounts
const url = await composio.mcp.experimental.getServer(mcpConfig.id, connectedAccountId, {
  limitTools: allowedTools,
});

const serverParams = new SSEClientTransport(url);

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