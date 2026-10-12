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
import { resolveCredentialHeaders } from '../../utils/sdk';
import type { ComposioRequestHeaders } from '../../types/composio.types';

export type PusherServiceOptions = {
  /** Default headers of the owning SDK instance; only `x-user-api-key` is consulted. */
  defaultHeaders?: ComposioRequestHeaders;
};

/** Internal signal: client setup was cancelled by unsubscribe(). */
class PusherInitCancelledError extends Error {
  constructor() {
    super('Pusher client initialization cancelled by unsubscribe');
    this.name = 'PusherInitCancelledError';
  }
}

export class PusherService {
  // these values are set via the Apollo API `/internal/sdk/realtime/credentials` endpoint
  private clientId!: string;
  private pusherKey!: string;
  private pusherCluster!: string;
  private pusherChannel!: string;
  // these details are set via the client SDK
  private pusherBaseURL!: string;
  private authHeaders!: Record<string, string>;
  private pusherClient?: PusherClient;
  // Shared by concurrent callers while the first client is being created.
  private pusherClientInit?: Promise<PusherClient>;
  // Bumped by unsubscribe(); an init started under an older generation is stale.
  private initGeneration = 0;
  private composioClient!: ComposioClient;

  constructor(client: ComposioClient, options: PusherServiceOptions = {}) {
    this.composioClient = client;
    this.pusherBaseURL = client.baseURL;
    // Channel authorization mirrors the client's effective auth; the
    // environment is never consulted here.
    this.authHeaders = resolveCredentialHeaders({
      apiKey: client.apiKey,
      userApiKey: client.userApiKey,
      defaultHeaders: options.defaultHeaders,
    });
    telemetry.instrument(this, 'PusherService');
  }

  /**
   * Creates a Pusher client
   *
   * This method is called when the Pusher client is first used.
   * It will fetch the SDK realtime credentials from the Apollo API and create a Pusher client.
   */
  private async getPusherClient(): Promise<PusherClient> {
    if (this.pusherClient) {
      return this.pusherClient;
    }
    // Concurrent first callers share one in-flight creation, so only one
    // websocket is ever opened.
    if (!this.pusherClientInit) {
      const generation = this.initGeneration;
      const init = this.createPusherClient(generation).finally(() => {
        if (this.pusherClientInit === init) {
          this.pusherClientInit = undefined;
        }
      });
      this.pusherClientInit = init;
    }
    return this.pusherClientInit;
  }

  private async createPusherClient(generation: number): Promise<PusherClient> {
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

    // unsubscribe() ran while we awaited credentials: do not connect.
    if (generation !== this.initGeneration) {
      throw new PusherInitCancelledError();
    }

    this.clientId = sdkRealtimeCredentials.projectId;
    this.pusherKey = sdkRealtimeCredentials.pusherKey;
    this.pusherCluster = sdkRealtimeCredentials.pusherCluster;
    this.pusherChannel = `private-${this.clientId}_triggers`;

    logger.debug(
      `[PusherService] Creating Pusher client for client ID: ${this.clientId} in cluster ${this.pusherCluster}`
    );

    // create the Pusher client
    let client: PusherClient;
    try {
      const { default: Pusher } = await import('pusher-js');
      // unsubscribe() ran while we awaited the import: do not connect.
      if (generation !== this.initGeneration) {
        throw new PusherInitCancelledError();
      }
      client = new Pusher(this.pusherKey, {
        cluster: this.pusherCluster,
        channelAuthorization: {
          endpoint: `${this.pusherBaseURL}/api/v3/internal/sdk/realtime/auth`,
          headers: { ...this.authHeaders },
          transport: 'ajax',
        },
      });
    } catch (error) {
      if (error instanceof PusherInitCancelledError) {
        throw error;
      }
      throw new ComposioFailedToCreatePusherClientError('Failed to create Pusher client', {
        cause: error,
      });
    }

    this.pusherClient = client;
    return client;
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
   * @param onSubscriptionError - Optional callback invoked with the raw payload when the
   * Pusher subscription fails (for example on auth or permission rejection). Errors thrown
   * from — or promises rejected by — this callback are contained and logged, never rethrown.
   */
  async subscribe(
    fn: (data: Record<string, unknown>) => void,
    onSubscriptionError?: (data: Record<string, unknown>) => void
  ) {
    try {
      logger.debug(`[PusherService] Subscribing to channel: ${this.pusherChannel}`);
      let pusherClient: PusherClient;
      try {
        pusherClient = await this.getPusherClient();
      } catch (error) {
        // unsubscribe() was called before setup finished; honour it.
        if (error instanceof PusherInitCancelledError) {
          logger.debug('[PusherService] Subscribe cancelled by unsubscribe before connecting');
          return;
        }
        throw error;
      }
      const channel = await pusherClient.subscribe(this.pusherChannel);

      // add subscription error handling
      const logCallbackFailure = (callbackError: unknown) => {
        const errorMessage =
          callbackError instanceof Error ? callbackError.message : String(callbackError);
        logger.error('❌ Error in subscription error callback:', errorMessage);
      };
      channel.bind('pusher:subscription_error', (data: Record<string, unknown>) => {
        logger.error('Trigger subscription error:', data);

        // surface the failure to the caller without letting a faulty
        // handler crash the host (same containment as the trigger callback).
        // A handler may be async: contain rejected promises too, or the
        // rejection escapes as an unhandled rejection after subscribe()
        // already resolved.
        try {
          Promise.resolve(onSubscriptionError?.(data)).catch(logCallbackFailure);
        } catch (callbackError: unknown) {
          logCallbackFailure(callbackError);
        }
      });

      // log success only when Pusher itself confirms the subscription
      channel.bind('pusher:subscription_succeeded', () => {
        logger.info(`✅ Subscribed to triggers. You should start receiving events now.`);
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
      // Never create a client just to tear one down. An unsubscribe before any
      // subscribe (or after a prior disconnect) is a no-op.
      const pusherClient = this.pusherClient;
      if (!pusherClient) {
        // A subscribe may still be fetching credentials or importing
        // pusher-js; invalidate it so it never opens a connection.
        if (this.pusherClientInit) {
          this.initGeneration++;
          this.pusherClientInit = undefined;
        }
        return;
      }

      logger.debug(`[PusherService] Unsubscribing from channel: ${this.pusherChannel}`);
      pusherClient.unsubscribe(this.pusherChannel);

      // Drop the websocket once nothing is subscribed. Channels whose
      // subscription was cancelled (pending auth) still sit in allChannels()
      // until unsubscribe removes them; they must not keep the connection open.
      const remaining = pusherClient.allChannels?.() ?? [];
      const hasActiveSubscription = remaining.some(channel => !channel.subscriptionCancelled);
      if (!hasActiveSubscription) {
        pusherClient.disconnect?.();
        this.pusherClient = undefined;
        this.initGeneration++;
      }

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
