import { Composio } from '@composio/core';

const composio = new Composio({apiKey: "your-api-key"});
const userId = 'user-id-123435'; 

// Check what configuration is required
const triggerType = await composio.triggers.getType("GITHUB_COMMIT_EVENT");
console.log(triggerType.config);
// Returns: {"properties": {...}, "required": ["owner", "repo"], ...}

// Create trigger with the required config
const trigger = await composio.triggers.create(
    userId, 
    'GITHUB_COMMIT_EVENT', 
    {
        triggerConfig: {
            owner: 'your-repo-owner',
            repo: 'your-repo-name'
        }
    }
);
console.log(`Trigger created: ${trigger.triggerId}`);