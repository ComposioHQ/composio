import { Composio } from '@composio/core';

// Initialize Composio client
const composio = new Composio({ apiKey: "your_api_key_here" });

// Subscribe to trigger events
composio.triggers.subscribe(
    (data) => {
        console.log(`New commit detected:`, data);
        // Add your custom logic here
    },
    { triggerId: 'your_trigger_id'    
        // userId: 'user@acme.com',
        // toolkits: ['github', 'slack'],
        // triggerSlug: ["GITHUB_STAR_ADDED_EVENT"]
        // authConfigId: "ac_1234567890" }
    }
);

// Note: For production use, set up webhooks instead