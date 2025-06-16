import { Composio } from '@composio/core';

const userId = 'user@acme.org';

const composio = new Composio();

const tools_1 = await composio.tools.get(userId, {
  toolkits: ['GITHUB', 'LINEAR'],
});

const tools_2 = await composio.tools.get(userId, {
  toolkits: ['GITHUB'],
  limit: 5, // Default limit=20
});

const tools_3 = await composio.tools.get(userId, {
  tools: ['GITHUB_CREATE_AN_ISSUE', 'GITHUB_CREATE_AN_ISSUE_COMMENT', 'GITHUB_CREATE_A_COMMIT'],
});

const tools_4 = await composio.tools.get(userId, {
  search: 'hackernews posts',
});
