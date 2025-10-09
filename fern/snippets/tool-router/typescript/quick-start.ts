import { Composio } from '@composio/core';

const composio = new Composio();
const userId = 'hey@example.com';

// Access the experimental ToolRouter
const session = await composio.experimental.toolRouter.createSession(userId);
// Returns:
// {
//   sessionId: "<session_id>",
//   url: "<mcp_url>"
// }

const mcpUrl = session.url;
