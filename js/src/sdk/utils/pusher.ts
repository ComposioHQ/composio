import logger from "../../utils/logger";

const PUSHER_KEY = process.env.CLIENT_PUSHER_KEY || "8e1b8c92b7f8b2151c15";
const PUSHER_CLUSTER = "mt1";

type Channel = {
  subscribe: (channelName: string) => unknown;
  unsubscribe: (channelName: string) => unknown;
  bind: (
    event: string,
    callback: (data: Record<string, unknown>) => void
  ) => unknown;
};

type PusherClient = {
  subscribe: (channelName: string) => Channel;
  unsubscribe: (channelName: string) => unknown;
  bind: (
    event: string,
    callback: (data: Record<string, unknown>) => void
  ) => unknown;
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
    };
  };
};

export class PusherUtils {
  static pusherClient: PusherClient;

  static getPusherClient(baseURL: string, apiKey: string): PusherClient {
    if (!PusherUtils.pusherClient) {
      // Dynamic import not available, using require for now
      // TODO: Update to use dynamic import when available
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const PusherClient = require("pusher-js");
      PusherUtils.pusherClient = new PusherClient(PUSHER_KEY, {
        cluster: PUSHER_CLUSTER,
        channelAuthorization: {
          endpoint: `${baseURL}/api/v1/client/auth/pusher_auth`,
          headers: {
            "x-api-key": apiKey,
          },
          transport: "ajax",
        },
      });
    }
    return PusherUtils.pusherClient;
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
      logger.error(
        `Error subscribing to ${channelName} with event ${event}: ${error}`
      );
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
    channel.bind(event, callback); // Allow normal unchunked events.

    // Now the chunked variation. Allows arbitrarily long messages.
    const events: {
      [key: string]: { chunks: string[]; receivedFinal: boolean };
    } = {};
    channel.bind("chunked-" + event, (data) => {
      const typedData = data as TChunkedTriggerData;
      if (!events.hasOwnProperty(typedData.id)) {
        events[typedData.id] = { chunks: [], receivedFinal: false };
      }
      const ev = events[typedData.id];
      ev.chunks[typedData.index] = typedData.chunk;
      if (typedData.final) ev.receivedFinal = true;
      if (
        ev.receivedFinal &&
        ev.chunks.length === Object.keys(ev.chunks).length
      ) {
        callback(JSON.parse(ev.chunks.join("")));
        delete events[typedData.id];
      }
    });
  }

  /**
   * Subscribes to a trigger channel for a client and handles chunked data.
   * @param {string} clientId - The unique identifier for the client subscribing to the events.
   * @param {(data: TriggerData) => void} fn - The callback function to execute when trigger data is received.
   */
  static triggerSubscribe(
    clientId: string,
    fn: (data: TriggerData) => void
  ): void {
    const channel = PusherUtils.pusherClient.subscribe(
      `private-${clientId}_triggers`
    );
    PusherUtils.bindWithChunking(
      channel as PusherClient,
      "trigger_to_client",
      fn as (data: unknown) => void
    );

    logger.info(
      `Subscribed to triggers. You should start receiving events now.`
    );
  }

  static triggerUnsubscribe(clientId: string): void {
    PusherUtils.pusherClient.unsubscribe(`${clientId}_triggers`);
  }
}
