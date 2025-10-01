import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Create an isolated session for a user
const session = await composio.experimental.toolRouter.createSession('user_123', {
  toolkits: [
    { toolkit: 'github', authConfigId: 'ac_github_work' },
    { toolkit: 'slack', authConfigId: 'ac_slack_team' }
  ],
  manuallyManageConnections: false
});

console.log('Session ID:', session.sessionId);
console.log('MCP URL:', session.url);

// Use the MCP URL with any MCP client