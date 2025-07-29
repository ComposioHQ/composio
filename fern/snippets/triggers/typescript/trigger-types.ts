import { Composio, TriggerEvent } from '@composio/core';

// Define type-safe payload for GitHub Star Added event
export type GitHubStarAddedEventPayload = {
  action: "created";
  repository_id: number;
  repository_name: string;
  repository_url: string;
  starred_at: string;
  starred_by: string;
};

const composio = new Composio();
const userId = 'user@acme.com';

// Create the trigger
const createResponse = await composio.triggers.create(userId, 'GITHUB_STAR_ADDED_EVENT', {
  triggerConfig: {
    owner: 'composiohq',
    repo: 'composio',
  },
});

// Fetch trigger type details
const triggerType = await composio.triggers.getType("GITHUB_STAR_ADDED_EVENT");
console.log(triggerType.config);

// Type-safe trigger event handler
function handleGitHubStarEvent(event: TriggerEvent<GitHubStarAddedEventPayload>) {
  console.log(`⭐ ${event.data.repository_name} starred by ${event.data.starred_by}`);
}

// Subscribe to triggers with type-safe handling
await composio.triggers.subscribe(
  (triggerData) => {
    if (triggerData.triggerSlug === 'GITHUB_STAR_ADDED_EVENT') {
      const starEvent: TriggerEvent<GitHubStarAddedEventPayload> = {
        type: triggerData.triggerSlug,
        timestamp: new Date().toISOString(),
        data: {
          ...triggerData.payload as GitHubStarAddedEventPayload,
          connection_nano_id: triggerData.metadata.connectedAccount.id,
          trigger_nano_id: triggerData.id,
          user_id: triggerData.userId,
        }
      };
      handleGitHubStarEvent(starEvent);
    }
  },
  {
    authConfigId: 'ac_1234567890',
    triggerSlug: ['GITHUB_STAR_ADDED_EVENT'],
  }
);

await composio.triggers.enable('ti_9q19nLNykmVZ');
await composio.triggers.disable('ti_9q19nLNykmVZ');

