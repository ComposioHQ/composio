import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

const composio = new Composio({
  provider: new VercelProvider(),
});
const session = await composio.toolRouter.create('user_123', { toolkits: {
  enabled: ['gmail'],
  // disabled: ['hackernews'],
}});
const toolkits = await session.toolkits();

console.log(JSON.stringify({ toolkits }, null, 2))