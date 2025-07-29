import type { NextApiRequest, NextApiResponse } from 'next';
import { TriggerEvent } from '@composio/core';

// Define type-safe payload for GitHub Star Added event
export type GitHubStarAddedEventPayload = {
  action: "created";
  repository_id: number;
  repository_name: string;
  repository_url: string;
  starred_at: string;
  starred_by: string;
};

// Type-safe handler function
function handleGitHubStarAddedEvent(event: TriggerEvent<GitHubStarAddedEventPayload>) {
  console.log(`⭐ ${event.data.repository_name} starred by ${event.data.starred_by}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    const payload = req.body;
    
    // Type-safe webhook payload processing
    if (payload.triggerSlug === 'GITHUB_STAR_ADDED_EVENT') {
      const starEvent: TriggerEvent<GitHubStarAddedEventPayload> = {
        type: payload.triggerSlug,
        timestamp: new Date().toISOString(),
        data: {
          ...payload.payload as GitHubStarAddedEventPayload,
          connection_nano_id: payload.metadata?.connectedAccount?.id || '',
          trigger_nano_id: payload.id || '',
          user_id: payload.userId || '',
        }
      };
      
      handleGitHubStarAddedEvent(starEvent);
    }
    
    res.status(200).json({ 
      status: 'success', 
      message: 'Webhook received and processed successfully'
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error while processing webhook' 
    });
  }
}
