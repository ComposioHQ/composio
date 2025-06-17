/**
 * @internal
 * This service is used to get the SDK realtime credentials.
 * It is used to get the Pusher key and project ID for the SDK realtime credentials.
 * These are the endpoints which are not exposed to the public via the client SDKs.
 */
import ComposioClitent from '@composio/client';
import {
  ComposioSDKRealtimeCredentialsResponse,
  SDKRealtimeCredentialsResponse,
  SDKRealtimeCredentialsResponseSchema,
} from './InternalService.types';
import { ValidationError } from '../../errors';
import logger from '../../utils/logger';
const SDK_REALTIME_CREDENTIALS_ENDPOINT = '/api/v3/internal/sdk/realtime/credentials';

export class InternalService {
  constructor(private readonly client: ComposioClitent) {
    this.client = client;
  }

  /**
   * Get the SDK realtime credentials
   * @returns {SDKRealtimeCredentialsResponse} The SDK realtime credentials
   */
  async getSDKRealtimeCredentials(): Promise<SDKRealtimeCredentialsResponse> {
    const response = await this.client.request<ComposioSDKRealtimeCredentialsResponse>({
      method: 'get',
      path: SDK_REALTIME_CREDENTIALS_ENDPOINT,
    });

    const parsedResponse = SDKRealtimeCredentialsResponseSchema.safeParse({
      pusherKey: response.pusher_key,
      projectId: response.project_id,
      pusherCluster: response.pusher_cluster,
    });

    logger.debug(
      `[InternalService] SDK realtime credentials: ${JSON.stringify(parsedResponse, null, 2)}`
    );

    if (!parsedResponse.success) {
      throw new ValidationError(`Failed to parse SDK realtime credentials`, {
        cause: parsedResponse.error,
      });
    }

    return parsedResponse.data;
  }
}
