import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const toolkit = await composio.tools.get('default', 'INvalid tool');
// const client = composio.getClient();
