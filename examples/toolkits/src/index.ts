import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const toolkit = await composio.toolkits.get('hackernews');

const connectedAccount = await composio.connectedAccounts.list({
  user_id: 'default',
  toolkit_slug: 'hackernews',
});

console.log(JSON.stringify(connectedAccount, null, 2));
