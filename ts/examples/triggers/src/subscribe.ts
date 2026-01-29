import { Composio } from '@composio/core';

// Initialize Composio client
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// create a trigger
const { triggerId } = await composio.triggers.create('default','GMAIL_NEW_GMAIL_MESSAGE', {
  connectedAccountId: 'ca_uQvmu9uZOhQo',
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
