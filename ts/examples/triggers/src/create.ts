import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// fetch a trigger type
const triggerType = await composio.triggers.getType('GMAIL_NEW_GMAIL_MESSAGE');

console.log(JSON.stringify(triggerType, null, 2));

// create a trigger
const trigger = await composio.triggers.create('default', triggerType.slug, {
  connectedAccountId: 'ca_uQvmu9uZOhQo',
  triggerConfig: {},
});

console.log(trigger);
