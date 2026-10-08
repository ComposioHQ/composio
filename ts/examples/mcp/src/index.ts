import { createMCPClient } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const authConfigId = process.env.COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID; // your Gmail auth config ID
const externalUserId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!authConfigId || !externalUserId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID and COMPOSIO_EXAMPLES_USER_ID');
}
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
// Named `examples-<label>-<unix-seconds>` so the provisioning script's --gc can
// tell an example's throwaway config from one someone created by hand. The API
// caps this name at 30 characters, so keep the label short and use seconds.
const mcpConfig = await composio.mcp.create(`examples-gmail-${Math.floor(Date.now() / 1000)}`, {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
    },
  ],
  allowedTools,
  manuallyManageConnections: false,
});

// 3. Retrieve the MCP server instance for the user
const server = await composio.mcp.generate(externalUserId, mcpConfig.id);

// The MCP endpoint authenticates with your Composio API key
const serverParams = new StreamableHTTPClientTransport(new URL(server.url), {
  requestInit: { headers: { 'x-api-key': process.env.COMPOSIO_API_KEY! } },
});

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
