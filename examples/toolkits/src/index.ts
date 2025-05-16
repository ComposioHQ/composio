import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const toolkit = await composio.toolkits.get('modifiers-example');

console.log(toolkit);
