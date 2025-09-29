import { Composio } from '@composio/core';
import { GoogleGenAI, mcpToTool } from '@google/genai';
import { GoogleProvider } from '@composio/google';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

function wrapTools(client: MCPClient) {
  return [mcpToTool(client)];
}

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const externalUserId = '<externalUserId>'; // Replace it with the user id from your database
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.experimental.mcp.create(`${Date.now()}`, {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
      allowedTools,
    },
  ],
  manuallyManageConnections: true,
});

// 3. Retrieve the MCP server instance for the user
const server = await composio.experimental.mcp.generate(externalUserId, mcpConfig.id);

// 4. Create a generic MCP client.
//    This client needs to remain "alive" not be dropped by the GC until
//    the tools are retrieved from it.
const serverParams = new SSEClientTransport(new URL(server.url));
const mcpClient = new MCPClient({
  name: 'composio-mcp-client',
  version: '1.0.0',
});

// 5. Retrieve tools.
await mcpClient.connect(serverParams);
const tools = wrapTools(mcpClient);

// 6. Initialize Google Gemini client.
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 7. Pass tools to Google Gemini-specific Agent.
const stream = await gemini.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email.`,
  config: {
    tools,
  },
});

// 8. Execute the Google Gemini-specific Agent.
for await (const chunk of stream) {
  console.log(chunk.text);
}

// 9. Close the generic MCP client.
await mcpClient.close();
