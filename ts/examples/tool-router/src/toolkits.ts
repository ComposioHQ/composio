import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

const composio = new Composio();

const session = await composio.experimental.create('user_123');

const toolkits = await session.toolkits(); 

console.log(JSON.stringify({ toolkits }, null, 2))