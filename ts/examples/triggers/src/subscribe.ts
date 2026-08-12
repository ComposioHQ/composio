import { Composio } from '@composio/core';

// Initialize Composio client
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const connectedAccountId = process.env.COMPOSIO_EXAMPLES_GMAIL_CONNECTED_ACCOUNT_ID; // your Gmail connected account ID
const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user that owns the connected account
if (!connectedAccountId || !userId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_CONNECTED_ACCOUNT_ID and COMPOSIO_EXAMPLES_USER_ID');
}

// create a trigger
const { triggerId } = await composio.triggers.create(userId, 'GMAIL_NEW_GMAIL_MESSAGE', {
  connectedAccountId,
  triggerConfig: {},
});

// Subscribe to triggers with optional filters
const sub = await composio.triggers.subscribe(
  metadata => {
    console.log('Received trigger event:');
    console.dir(metadata, { depth: 3 });
  },
  { triggerId }
);

console.log('Subscribed to triggers. Waiting for events...');

// Keep the process alive forever
process.stdin.resume();
