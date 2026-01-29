import { Composio } from '@composio/core';

// Initialize Composio client
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Subscribe to triggers with optional filters
// Replace 'ti_ollBPgfhgmMK' with your actual trigger ID
const sub = await composio.triggers.subscribe(
  metadata => {
    console.log('Received trigger event:');
    console.dir(metadata, { depth: 3 });
  },
  { triggerId: 'ti_ollBPgfhgmMK' }
);

console.log('Subscribed to triggers. Waiting for events...');

// Keep the process alive forever
process.stdin.resume();
