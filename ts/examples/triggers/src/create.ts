import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// fetch a trigger type
const triggerType = await composio.triggers.getType('GMAIL_NEW_GMAIL_MESSAGE');

console.log(JSON.stringify(triggerType, null, 2));

const connectedAccountId = process.env.COMPOSIO_EXAMPLES_GMAIL_CONNECTED_ACCOUNT_ID; // your Gmail connected account ID
const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user that owns the connected account
if (!connectedAccountId || !userId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_CONNECTED_ACCOUNT_ID and COMPOSIO_EXAMPLES_USER_ID');
}

// create a trigger
const trigger = await composio.triggers.create(userId, triggerType.slug, {
  connectedAccountId,
  triggerConfig: {},
});

console.log(trigger);
