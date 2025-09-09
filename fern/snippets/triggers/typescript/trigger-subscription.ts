import { Composio } from '@composio/core';

// Initialize Composio client
const composio = new Composio({ apiKey: "your_api_key_here" });

// Subscribe to trigger events
composio.triggers.subscribe(
    (data) => {
        console.log(`New commit detected:`, data);
        // Add your custom logic here
    },
    { triggerId: 'your_trigger_id' }
);

// Note: For production use, set up webhooks instead