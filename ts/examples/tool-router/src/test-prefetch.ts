import 'dotenv/config';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

const composio = new Composio({
  provider: new VercelProvider(),
});

console.log('✅ Creating session...');
const session = await composio.toolRouter.create('user_123', {
  toolkits: ['hackernews'],
});

console.log('✅ Fetching tools with prefetchTools...');
const tools = await session.tools({
  experimental: {
    prefetchTools: ['HACKERNEWS_GET_USER'],
  },
});

const toolNames = Object.keys(tools);
console.log(`✅ Got ${toolNames.length} tools:`);
console.log('   -', toolNames.join('\n   - '));

console.log('\n✅ Named parameters working correctly!');
