import ComposioClient from '@composio/client';
import { PusherClient, TChunkedTriggerData } from '../../types/pusher.types';
import { InternalService } from '../internal/InternalService';
import { SDKRealtimeCredentialsResponse } from '../internal/InternalService.types';
import {
  ComposioFailedToCreatePusherClientError,
  ComposioFailedToGetSDKRealtimeCredentialsError,
  ComposioFailedToSubscribeToPusherChannelError,
} from '../../errors/TriggerErrors';
import logger from '../../utils/logger';
import { telemetry } from '../../telemetry/Telemetry';

export class PusherService {
  // these values are set via the Apollo API `/internal/sdk/realtime/credentials` endpoint
  private clientId!: string;
  private pusherKey!: string;
  private pusherCluster!: string;
  private pusherChannel!: string;
  // these details are set via the client SDK
  private pusherBaseURL!: string;
  private apiKey!: string;
  private pusherClient!: PusherClient;
  private composioClient!: ComposioClient;

  constructor(client: ComposioClient) {
    this.composioClient = client;
    this.pusherBaseURL = client.baseURL;
    this.apiKey = client.apiKey ?? process.env.COMPOSIO_API_KEY ?? '';
    telemetry.instrument(this, 'PusherService');
  }

  /**
   * Creates a Pusher client
   *
   * This method is called when the Pusher client is first used.
   * It will fetch the SDK realtime credentials from the Apollo API and create a Pusher client.
   */
  private async getPusherClient() {
    if (!this.pusherClient) {
      const internalService = new InternalService(this.composioClient);
      let sdkRealtimeCredentials: SDKRealtimeCredentialsResponse;
      try {
        sdkRealtimeCredentials = await internalService.getSDKRealtimeCredentials();
      } catch (error) {
        throw new ComposioFailedToGetSDKRealtimeCredentialsError(
          'Failed to get SDK realtime credentials',
          {
            cause: error,
          }
        );
      }

      this.clientId = sdkRealtimeCredentials.projectId;
      this.pusherKey = sdkRealtimeCredentials.pusherKey;
      this.pusherCluster = sdkRealtimeCredentials.pusherCluster;
      this.pusherChannel = `private-${this.clientId}_triggers`;

      logger.debug(
        `[PusherService] Creating Pusher client for client ID: ${this.clientId} in cluster ${this.pusherCluster}`
      );

      // create the Pusher client
      try {
        const { default: Pusher } = await import('pusher-js');
        this.pusherClient = new Pusher(this.pusherKey, {
          cluster: this.pusherCluster,
          channelAuthorization: {
            endpoint: `${this.pusherBaseURL}/api/v3/internal/sdk/realtime/auth`,
            headers: {
              'x-api-key': this.apiKey,
            },
            transport: 'ajax',
          },
        });
      } catch (error) {
        throw new ComposioFailedToCreatePusherClientError('Failed to create Pusher client', {
          cause: error,
        });
      }
    }

    return this.pusherClient;
  }

  /**
   * Binds a chunked event to a Pusher client
   *
   *
   * @param channel - The Pusher client to bind the event to
   * @param event - The event to bind to
   * @param callback - The function to call when the event is received
   */
  private bindWithChunking(
    channel: PusherClient,
    event: string,
    callback: (data: Record<string, unknown>) => void
  ): void {
    try {
      channel.bind(event, callback);

      // Now the chunked variation. Allows arbitrarily long messages.
      const events: {
        [key: string]: { chunks: string[]; receivedFinal: boolean };
      } = {};

      channel.bind('chunked-' + event, data => {
        try {
          const typedData = data as TChunkedTriggerData;

          // Validate chunked data
          if (
            !typedData ||
            typeof typedData.id !== 'string' ||
            typeof typedData.index !== 'number'
          ) {
            throw new Error('Invalid chunked trigger data format');
          }

          if (!events.hasOwnProperty(typedData.id)) {
            events[typedData.id] = { chunks: [], receivedFinal: false };
          }

          const ev = events[typedData.id];
          ev.chunks[typedData.index] = typedData.chunk;

          if (typedData.final) ev.receivedFinal = true;

          if (ev.receivedFinal && ev.chunks.length === Object.keys(ev.chunks).length) {
            try {
              const parsedData = JSON.parse(ev.chunks.join(''));
              callback(parsedData);
            } catch (parseError: unknown) {
              const errorMessage =
                parseError instanceof Error ? parseError.message : String(parseError);
              logger.error('Failed to parse chunked data:', errorMessage);
            } finally {
              delete events[typedData.id];
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Error processing chunked trigger data:', errorMessage);
          // Clean up the event data to prevent memory leaks
          if (data && typeof data === 'object' && 'id' in data) {
            delete events[data.id as string];
          }
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to bind chunked events:', error);
      throw new Error(`Failed to bind chunked events: ${errorMessage}`);
    }
  }

  /**
   * Subscribes to pusher to receive events from the server
   *
   * This method is used to subscribe to a Pusher channel.
   * It will create a Pusher client if it doesn't exist.
   *
   * @param channelName - The name of the Pusher channel to subscribe to
   * @param event - The event to subscribe to
   * @param fn - The function to call when the event is received
   */
  async subscribe(fn: (data: Record<string, unknown>) => void) {
    try {
      logger.debug(`[PusherService] Subscribing to channel: ${this.pusherChannel}`);
      const pusherClient = await this.getPusherClient();
      const channel = await pusherClient.subscribe(this.pusherChannel);

      // add subscription error handling
      channel.bind('pusher:subscription_error', (data: Record<string, unknown>) => {
        const error = data.error ? String(data.error) : 'Unknown subscription error';
        throw new ComposioFailedToSubscribeToPusherChannelError(
          `Trigger subscription error: ${error}`,
          {
            cause: error,
          }
        );
      });

      // wrap the callback to handle errors
      const safeCallback = (data: Record<string, unknown>) => {
        try {
          fn(data);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('❌ Error in trigger callback:', errorMessage);
          // don't throw here to prevent breaking the subscription
        }
      };

      this.bindWithChunking(channel as PusherClient, 'trigger_to_client', safeCallback);

      logger.info(`✅ Subscribed to triggers. You should start receiving events now.`);
    } catch (error) {
      throw new ComposioFailedToSubscribeToPusherChannelError(
        'Failed to subscribe to Pusher channel',
        {
          cause: error,
        }
      );
    }
  }

  /**
   * Unsubscribes from a Pusher channel
   *
   * This method is used to unsubscribe from a Pusher channel.
   * It will create a Pusher client if it doesn't exist.
   *
   * @param channelName - The name of the Pusher channel to unsubscribe from
   */
  async unsubscribe() {
    try {
      logger.debug(`[PusherService] Unsubscribing from channel: ${this.pusherChannel}`);
      const pusherClient = await this.getPusherClient();
      await pusherClient.unsubscribe(this.pusherChannel);
      logger.info(`✅ Unsubscribed from triggers.`);
    } catch (error) {
      throw new ComposioFailedToSubscribeToPusherChannelError(
        'Failed to unsubscribe from Pusher channel',
        {
          cause: error,
        }
      );
    }
  }
}
