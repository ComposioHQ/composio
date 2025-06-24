import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const triggerTypes = await composio.triggers.listTypes({
  toolkits: ['github'],
  limit: 1,
});

console.log(JSON.stringify(triggerTypes, null, 2));

const triggerType = await composio.triggers.getType('GITHUB_COMMIT_EVENT');

console.log(JSON.stringify(triggerType, null, 2));