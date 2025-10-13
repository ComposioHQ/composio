import { z } from 'zod/v3';

export interface ComposioSDKRealtimeCredentialsResponse {
  pusher_key: string;
  project_id: string;
  pusher_cluster: string;
}

export const SDKRealtimeCredentialsResponseSchema = z.object({
  projectId: z.string().describe('The project ID'),
  pusherKey: z.string().describe('The Pusher key'),
  pusherCluster: z.string().describe('The Pusher cluster'),
});
export type SDKRealtimeCredentialsResponse = z.infer<typeof SDKRealtimeCredentialsResponseSchema>;
