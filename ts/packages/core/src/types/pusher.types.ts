export interface PusherClient {
  subscribe: (channelName: string) => PusherChannel;
  unsubscribe: (channelName: string) => void;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => void;
  disconnect: () => void;
}

export interface PusherChannel {
  subscribe: (channelName: string) => unknown;
  unsubscribe: (channelName: string) => void;
  bind: (event: string, callback: (data: Record<string, unknown>) => void) => void;
  unbind_all: () => void;
}

export type TChunkedTriggerData = {
  id: string;
  index: number;
  chunk: string;
  final: boolean;
};
