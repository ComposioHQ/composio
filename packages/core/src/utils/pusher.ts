import { PusherSubscriptionError } from '../errors/PusherErrors';
import logger from './logger';

const PUSHER_KEY = process.env.CLIENT_PUSHER_KEY || 'ff9f18c208855d77a152';
const PUSHER_CLUSTER = 'mt1';

type Channel = {
  subscribe: (channelName: string) => unknown;
  unsubscribe: (channelName: string) => unknown;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => unknown;
};

type PusherClient = {
  subscribe: (channelName: string) => Channel;
  unsubscribe: (channelName: string) => unknown;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => unknown;
  connection: {
    bind: (event: string, callback: (error: Error) => void) => void;
    socket_id?: string;
  };
};

type AuthOptions = {
  endpoint: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
};

type TChunkedTriggerData = {
  id: string;
  index: number;
  chunk: string;
  final: boolean;
};

export type TriggerData = {
  appName: string;
  clientId: number;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  metadata: {
    id: string;
    connectionId: string;
    triggerName: string;
    triggerData: string;
    triggerConfig: Record<string, unknown>;
    connection: {
      id: string;
      integrationId: string;
      clientUniqueUserId: string;
      status: string;
      connectedAccountNanoId: string;
      authConfigNanoId: string;
    };
  };
};

export class PusherUtils {
  static pusherClient: PusherClient;

  static async getPusherClient(baseURL: string, apiKey: string): Promise<PusherClient> {
    try {
      if (!PusherUtils.pusherClient) {
        // Dynamic import not available, using require for now
        // TODO: Update to use dynamic import when available
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PusherClient = require('pusher-js');
        PusherUtils.pusherClient = new PusherClient(PUSHER_KEY, {
          cluster: PUSHER_CLUSTER,
          channelAuthorization: {
            endpoint: `${baseURL}/api/v3/internal/sdk/realtime/auth`,
            headers: {
              'x-api-key': apiKey,
            },
            transport: 'ajax',
            customHandler: async (authOptions: AuthOptions) => {
              try {
                const response = await fetch(authOptions.endpoint, {
                  method: 'POST',
                  headers: {
                    ...authOptions.headers,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(authOptions.params),
                });
                const data = await response.text();
                logger.debug('Pusher auth response:', data);
                try {
                  return JSON.parse(data);
                } catch (e) {
                  logger.error('Failed to parse auth response:', e);
                  throw new Error('Invalid auth response format');
                }
              } catch (error) {
                logger.error('Pusher auth request failed:', error);
                throw error;
              }
            },
          },
        });

        // Add connection error handling
        PusherUtils.pusherClient.connection.bind('error', (err: Error) => {
          logger.error('Pusher connection error:', err);
          throw new Error(`Pusher connection error: ${err.message}`);
        });
      }
      return PusherUtils.pusherClient;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize Pusher client:', error);
      throw new Error(`Failed to initialize Pusher client: ${errorMessage}`);
    }
  }

  /**
   * Subscribes to a Pusher channel and binds an event to a callback function.
   * @param {string} channelName - The name of the channel to subscribe to.
   * @param {string} event - The event to bind to the channel.
   * @param {(data: Record<string, unknown>) => void} fn - The callback function to execute when the event is triggered.
   * @returns {PusherClient} The Pusher client instance.
   */
  static async subscribe(
    channelName: string,
    event: string,
    fn: (data: Record<string, unknown>) => void
  ): Promise<void> {
    try {
      await PusherUtils.pusherClient.subscribe(channelName).bind(event, fn);
    } catch (error) {
      logger.error(`Error subscribing to ${channelName} with event ${event}: ${error}`);
    }
  }

  /**
   * Unsubscribes from a Pusher channel.
   * @param {string} channelName - The name of the channel to unsubscribe from.
   * @returns {void}
   */
  static async unsubscribe(channelName: string): Promise<void> {
    PusherUtils.pusherClient.unsubscribe(channelName);
  }

  /**
   * Binds an event to a channel with support for chunked messages.
   * @param {PusherClient} channel - The Pusher channel to bind the event to.
   * @param {string} event - The event to bind to the channel.
   * @param {(data: unknown) => void} callback - The callback function to execute when the event is triggered.
   */
  private static bindWithChunking(
    channel: PusherClient,
    event: string,
    callback: (data: Record<string, unknown>) => void
  ): void {
    try {
      // Wrap the callback to handle errors
      const safeCallback = (data: Record<string, unknown>) => {
        try {
          callback(data);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Error in chunked event callback:', errorMessage);
          // Don't throw here to prevent breaking the subscription
        }
      };

      channel.bind(event, safeCallback);

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
              safeCallback(parsedData);
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
   * Subscribes to a trigger channel for a client and handles chunked data.
   * @param {string} clientId - The unique identifier for the client subscribing to the events.
   * @param {(data: TriggerData) => void} fn - The callback function to execute when trigger data is received.
   *
   * @example
   * ```ts
   * composio.trigger.subscribe((data) => {
   *   console.log(data);
   * });
   * ```
   */
  static triggerSubscribe(clientId: string, fn: (data: TriggerData) => void): void {
    try {
      if (!PusherUtils.pusherClient) {
        throw new Error('Pusher client not initialized');
      }

      const channel = PusherUtils.pusherClient.subscribe(`private-${clientId}_triggers`);

      // Add subscription error handling
      channel.bind('pusher:subscription_error', (data: Record<string, unknown>) => {
        const error = data.error ? String(data.error) : 'Unknown subscription error';
        throw new PusherSubscriptionError(`Trigger subscription error`, {
          cause: error,
        });
      });

      // Wrap the callback to handle errors
      const safeCallback = (data: TriggerData) => {
        try {
          fn(data);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Error in trigger callback:', errorMessage);
          // Don't throw here to prevent breaking the subscription
        }
      };

      PusherUtils.bindWithChunking(
        channel as PusherClient,
        'trigger_to_client',
        safeCallback as (data: unknown) => void
      );

      logger.info(`Subscribed to triggers. You should start receiving events now.`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to subscribe to triggers:', error);
      throw new Error(`Failed to subscribe to triggers: ${errorMessage}`);
    }
  }

  static triggerUnsubscribe(clientId: string): void {
    try {
      if (!PusherUtils.pusherClient) {
        throw new Error('Pusher client not initialized');
      }
      PusherUtils.pusherClient.unsubscribe(`private-${clientId}_triggers`);
      logger.info('Successfully unsubscribed from triggers');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to unsubscribe from triggers:', error);
      throw new Error(`Failed to unsubscribe from triggers: ${errorMessage}`);
    }
  }
}
