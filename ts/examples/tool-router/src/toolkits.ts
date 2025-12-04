import { Composio } from '@composio/core';

const composio = new Composio();

const session = await composio.experimental.create('user_123');

const toolkits = await session.toolkits({ toolkits: ["github"]}); 

console.log(JSON.stringify({ toolkits }, null, 2))