import { z } from 'zod';

export interface ComposioSDKRealtimeCredentialsResponse {
  pusher_key: string;
  project_id: string;
}

export const SDKRealtimeCredentialsResponseSchema = z.object({
  pusherKey: z.string().describe('The Pusher key'),
  pusherCluster: z.string().describe('The Pusher cluster'),
  projectId: z.string().describe('The project ID'),
});
export type SDKRealtimeCredentialsResponse = z.infer<typeof SDKRealtimeCredentialsResponseSchema>;
