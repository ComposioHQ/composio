import { Composio } from '@composio/core';
import { GoogleGenAI, mcpToTool } from '@google/genai';
import { GoogleProvider } from '@composio/google';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function wrapTools(client: MCPClient) {
  return [mcpToTool(client)];
}

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

const externalUserId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!externalUserId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

// 2. Create a session scoped to the Gmail toolkit; it exposes a hosted MCP endpoint.
// manageConnections defaults to true, which would add connection-management tools
// this example does not use. The config it replaced set manuallyManageConnections.
const session = await composio.sessions.create(externalUserId, {
  toolkits: ['gmail'],
  manageConnections: false,
  mcp: true,
});

// 3. Create a generic MCP client.
//    This client needs to remain "alive" not be dropped by the GC until
//    the tools are retrieved from it.
//    session.mcp.headers carries the credentials the endpoint requires.
const serverParams = new StreamableHTTPClientTransport(new URL(session.mcp.url), {
  requestInit: { headers: session.mcp.headers },
});
const mcpClient = new MCPClient({
  name: 'composio-mcp-client',
  version: '1.0.0',
});

// 4. Retrieve tools.
await mcpClient.connect(serverParams);
const tools = wrapTools(mcpClient);

// 5. Initialize Google Gemini client.
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 6. Pass tools to Google Gemini-specific Agent.
const stream = await gemini.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email.`,
  config: {
    tools,
  },
});

// 7. Execute the Google Gemini-specific Agent.
for await (const chunk of stream) {
  console.log(chunk.text);
}

// 8. Close the generic MCP client.
await mcpClient.close();
