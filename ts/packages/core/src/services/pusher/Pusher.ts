import ComposioClient from '@composio/client';
import { PusherChannel, PusherClient, TChunkedTriggerData } from '../../types/pusher.types';
import { InternalService } from '../internal/InternalService';
import { SDKRealtimeCredentialsResponse } from '../internal/InternalService.types';
import {
  ComposioFailedToCreatePusherClientError,
  ComposioFailedToGetSDKRealtimeCredentialsError,
  ComposioFailedToSubscribeToPusherChannelError,
} from '../../errors/TriggerErrors';
import logger from '../../utils/logger';
import { invokeUserCallback } from '../../utils/userCallback';
import { telemetry } from '../../telemetry/Telemetry';
import { resolveCredentialHeaders } from '../../utils/sdk';
import type { ComposioRequestHeaders } from '../../types/composio.types';

export type PusherServiceOptions = {
  /** The project API key the owning SDK instance resolved, or `null` when disabled. */
  apiKey?: string | null;
  /** The user API key the owning SDK instance resolved, or `null`. */
  userApiKey?: string | null;
  /** The organization API key the owning SDK instance resolved, or `null`. */
  orgApiKey?: string | null;
  /** Default headers of the owning SDK instance; only `x-user-api-key` is consulted. */
  defaultHeaders?: ComposioRequestHeaders;
};

/** A pusher-js client and the triggers channel it subscribed to. */
type TriggerConnection = {
  client: PusherClient;
  channel: PusherChannel;
  channelName: string;
};

/**
 * Setup of the connection for one subscription period, which runs from the first `subscribe()`
 * to the next `unsubscribe()`. Concurrent `subscribe()` calls share `ready`; `unsubscribe()`
 * aborts `controller` so that setup still in flight neither connects nor installs handlers.
 */
type ConnectionAttempt = {
  controller: AbortController;
  ready: Promise<TriggerConnection>;
};

/**
 * Owns the realtime connection that delivers trigger events.
 *
 * Each subscription period gets its own pusher-js client, which `unsubscribe()` disconnects.
 * Reusing one client across periods is unsafe: pusher-js keeps a channel, its bound handlers and
 * its cancellation flag through `disconnect()` and resubscribes every kept channel on the next
 * `connect()`, and a channel-auth reply requested on the old socket can arrive after a reconnect
 * and be sent on the new one.
 */
export class PusherService {
  // these details are set via the client SDK
  private pusherBaseURL!: string;
  private authHeaders!: Record<string, string>;
  private composioClient!: ComposioClient;
  private attempt?: ConnectionAttempt;
  // Set as soon as the current attempt creates its client, so that `unsubscribe()` can close it
  // before the `subscribe()` calls waiting on `attempt.ready` resume.
  private connection?: TriggerConnection;

  constructor(client: ComposioClient, options: PusherServiceOptions = {}) {
    this.composioClient = client;
    this.pusherBaseURL = client.baseURL;
    // Channel authorization mirrors the SDK instance's effective auth, from the
    // keys the SDK resolved; the environment is never consulted here.
    this.authHeaders = resolveCredentialHeaders({
      apiKey: options.apiKey,
      userApiKey: options.userApiKey,
      orgApiKey: options.orgApiKey,
      defaultHeaders: options.defaultHeaders,
    });
    telemetry.instrument(this, 'PusherService');
  }

  /**
   * Returns the connection attempt of the current subscription period, starting one if needed.
   * A failed attempt is forgotten, so the next `subscribe()` retries.
   */
  private connect(): ConnectionAttempt {
    if (this.attempt) return this.attempt;

    const controller = new AbortController();
    const ready = this.openConnection(controller.signal);
    const attempt = { controller, ready };
    this.attempt = attempt;
    ready.catch(() => {
      if (this.attempt === attempt) this.attempt = undefined;
    });
    return attempt;
  }

  /**
   * Fetches the SDK realtime credentials from the Apollo API, creates a Pusher client and
   * subscribes it to the triggers channel.
   */
  private async openConnection(signal: AbortSignal): Promise<TriggerConnection> {
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

    const { projectId, pusherKey, pusherCluster } = sdkRealtimeCredentials;
    const channelName = `private-${projectId}_triggers`;

    let Pusher: (typeof import('pusher-js'))['default'];
    try {
      ({ default: Pusher } = await import('pusher-js'));
    } catch (error) {
      throw new ComposioFailedToCreatePusherClientError('Failed to create Pusher client', {
        cause: error,
      });
    }

    // unsubscribe() ran while the credentials or pusher-js were loading. Everything below is
    // synchronous, so this is the last point at which it can cancel the attempt.
    if (signal.aborted) {
      throw new Error('Connection attempt cancelled by unsubscribe()');
    }

    logger.debug(
      `[PusherService] Creating Pusher client for client ID: ${projectId} in cluster ${pusherCluster}`
    );

    let client: PusherClient;
    try {
      client = new Pusher(pusherKey, {
        cluster: pusherCluster,
        channelAuthorization: {
          endpoint: `${this.pusherBaseURL}/api/v3/internal/sdk/realtime/auth`,
          headers: { ...this.authHeaders },
          transport: 'ajax',
        },
      });
    } catch (error) {
      throw new ComposioFailedToCreatePusherClientError('Failed to create Pusher client', {
        cause: error,
      });
    }

    logger.debug(`[PusherService] Subscribing to channel: ${channelName}`);
    try {
      this.connection = { client, channel: client.subscribe(channelName), channelName };
    } catch (error) {
      client.disconnect();
      throw error;
    }
    return this.connection;
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
    channel: PusherChannel,
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
   * The first call of a subscription period creates the Pusher client; concurrent calls share
   * it. A call still waiting for the client when `unsubscribe()` runs resolves without
   * subscribing.
   *
   * @param fn - The function to call when the event is received
   * @param onSubscriptionError - Optional callback invoked with the raw payload when the
   * Pusher subscription fails (for example on auth or permission rejection). Errors thrown
   * from — or promises rejected by — this callback are contained and logged, never rethrown.
   */
  async subscribe(
    fn: (data: Record<string, unknown>) => void,
    onSubscriptionError?: (data: Record<string, unknown>) => void
  ) {
    const attempt = this.connect();
    let connection: TriggerConnection;
    try {
      connection = await attempt.ready;
    } catch (error) {
      if (attempt.controller.signal.aborted) {
        logger.debug('[PusherService] Subscribe cancelled by unsubscribe() before it connected');
        return;
      }
      throw new ComposioFailedToSubscribeToPusherChannelError(
        'Failed to subscribe to Pusher channel',
        {
          cause: error,
        }
      );
    }
    // unsubscribe() ran after the client was created but before this call resumed.
    if (attempt.controller.signal.aborted) {
      logger.debug('[PusherService] Subscribe cancelled by unsubscribe() before it connected');
      return;
    }

    try {
      const { channel } = connection;
      channel.bind('pusher:subscription_error', (data: Record<string, unknown>) => {
        logger.error('Trigger subscription error:', data);

        // surface the failure to the caller without letting a faulty
        // handler crash the host (same containment as the trigger callback).
        invokeUserCallback('❌ Error in subscription error callback:', () =>
          onSubscriptionError?.(data)
        );
      });

      // log success only when Pusher itself confirms the subscription
      channel.bind('pusher:subscription_succeeded', () => {
        logger.info(`✅ Subscribed to triggers. You should start receiving events now.`);
      });

      // don't let a failing callback break the subscription
      const safeCallback = (data: Record<string, unknown>) => {
        invokeUserCallback('❌ Error in trigger callback:', () => fn(data));
      };

      this.bindWithChunking(channel, 'trigger_to_client', safeCallback);
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
   * Unsubscribes from the triggers channel and closes the connection
   *
   * This ends the subscription period: setup still in flight is cancelled, the handlers bound by
   * every `subscribe()` call are removed, and the Pusher client is disconnected. Without a prior
   * `subscribe()` this does nothing; it never creates a client or fetches credentials.
   */
  async unsubscribe() {
    const { attempt, connection } = this;
    this.attempt = undefined;
    this.connection = undefined;
    attempt?.controller.abort();

    if (!connection) {
      logger.debug('[PusherService] No open connection to unsubscribe from');
      return;
    }

    logger.debug(`[PusherService] Unsubscribing from channel: ${connection.channelName}`);
    try {
      // pusher-js keeps a reference to every client it creates, so release the handlers this
      // service bound and the user callbacks they hold.
      connection.channel.unbind_all();
      connection.client.unsubscribe(connection.channelName);
    } catch (error) {
      throw new ComposioFailedToSubscribeToPusherChannelError(
        'Failed to unsubscribe from Pusher channel',
        {
          cause: error,
        }
      );
    } finally {
      connection.client.disconnect();
    }
    logger.info(`✅ Unsubscribed from triggers.`);
  }
}
