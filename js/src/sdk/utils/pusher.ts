const PUSHER_KEY = "ff9f18c208855d77a152"
const PUSHER_CLUSTER = "mt1"

type PusherClient = any;

export interface TriggerData {
    appName: string;
    clientId: number;
    payload: {};
    originalPayload: Record<string, any>;
    metadata: {
        id: string;
        connectionId: string;
        triggerName: string;
        triggerData: string;
        triggerConfig: Record<string, any>;
        connection: {
            id: string;
            integrationId: string;
            clientUniqueUserId: string;
            status: string;
        }
    }
}


export class PusherUtils {

    static pusherClient:  PusherClient;

    static getPusherClient(baseURL: string, apiKey: string):  PusherClient {

        if (!PusherUtils.pusherClient) {
            const PusherClient = require("pusher-js")
            PusherUtils.pusherClient = new PusherClient(PUSHER_KEY, {
                cluster: PUSHER_CLUSTER,
                channelAuthorization: {
                    endpoint: `${baseURL}/v1/client/auth/pusher_auth`,
                    headers: {
                        "x-api-key": apiKey
                    },
                    transport: "ajax",
                }
            });
            
        }
        return PusherUtils.pusherClient;
    }
    /**
     * Subscribes to a Pusher channel and binds an event to a callback function.
     * @param {string} channelName - The name of the channel to subscribe to.
     * @param {string} event - The event to bind to the channel.
     * @param {(data: any) => void} fn - The callback function to execute when the event is triggered.
     * @returns {PusherClient} The Pusher client instance.
     */
    static async subscribe(channelName: string, event: string, fn: (data: any) => void): Promise<void> {
        try {
            await PusherUtils.pusherClient.subscribe(channelName).bind(event, fn);
        } catch (error) {
            console.error(`Error subscribing to ${channelName} with event ${event}: ${error}`);
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
     * @param {(data: any) => void} callback - The callback function to execute when the event is triggered.
     */
    private static bindWithChunking(channel: PusherClient, event: string, callback: (data: any) => void): void {
        channel.bind(event, callback); // Allow normal unchunked events.

        // Now the chunked variation. Allows arbitrarily long messages.
        const events: { [key: string]: { chunks: string[], receivedFinal: boolean } } = {};
        channel.bind("chunked-" + event, (data: { id: string, index: number, chunk: string, final: boolean }) => {
            if (!events.hasOwnProperty(data.id)) {
                events[data.id] = { chunks: [], receivedFinal: false };
            }
            const ev = events[data.id];
            ev.chunks[data.index] = data.chunk;
            if (data.final) ev.receivedFinal = true;
            if (ev.receivedFinal && ev.chunks.length === Object.keys(ev.chunks).length) {
                callback(JSON.parse(ev.chunks.join("")));
                delete events[data.id];
            }
        });
    }

    /**
     * Subscribes to a trigger channel for a client and handles chunked data.
     * @param {string} clientId - The unique identifier for the client subscribing to the events.
     * @param {(data: any) => void} fn - The callback function to execute when trigger data is received.
     */
    static triggerSubscribe(clientId: string, fn: (data: TriggerData) => void): void {
        var channel = PusherUtils.pusherClient.subscribe(`private-${clientId}_triggers`);
        PusherUtils.bindWithChunking(channel, "trigger_to_client", fn);

        console.log(`Subscribed to ${clientId}_triggers`);
    }

    static triggerUnsubscribe(clientId: string): void {
        PusherUtils.pusherClient.unsubscribe(`${clientId}_triggers`);
    }
}
