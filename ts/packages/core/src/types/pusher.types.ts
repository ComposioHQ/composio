export interface PusherClient {
  subscribe: (channelName: string) => PusherChannel;
  unsubscribe: (channelName: string) => void;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => void;
  /** Close the underlying websocket. Present on pusher-js clients. */
  disconnect?: () => void;
  /** Channels currently held by the client, including pending ones. */
  allChannels?: () => Array<{ subscriptionCancelled?: boolean }>;
}

export interface PusherChannel {
  subscribe: (channelName: string) => unknown;
  unsubscribe: (channelName: string) => void;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => void;
}

export type TChunkedTriggerData = {
  id: string;
  index: number;
  chunk: string;
  final: boolean;
};
