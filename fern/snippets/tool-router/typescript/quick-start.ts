import { Composio } from '@composio/core';

const composio = new Composio();
const userId = 'hey@example.com';

// Access the experimental ToolRouter
const session = await composio.experimental.toolRouter.createSession(userId);
// Returns:
// {
//   sessionId: "dKDoDWAGUf-hPM-Bw39pJ",
//   url: "https://apollo.composio.dev/v3/mcp/tool-router/dKDoDWAGUf-hPM-Bw39pJ/mcp"
// }

const mcpUrl = session.url;
