export interface PusherClient {
  subscribe: (channelName: string) => PusherChannel;
  unsubscribe: (channelName: string) => void;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => void;
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
