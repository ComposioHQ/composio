import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PusherService } from '../../src/services/pusher/Pusher';

type EventHandler = (data: Record<string, unknown>) => void;

const { bindings, mockChannel, mockPusherClient, mockGetCredentials, mockLoggerError } = vi.hoisted(
  () => {
    const eventBindings = new Map<string, EventHandler>();
    const channel = {
      bind: vi.fn((event: string, callback: EventHandler) => {
        eventBindings.set(event, callback);
      }),
      emit: (event: string, data: Record<string, unknown>) => {
        eventBindings.get(event)?.(data);
      },
    };

    return {
      bindings: eventBindings,
      mockChannel: channel,
      mockPusherClient: {
        subscribe: vi.fn().mockReturnValue(channel),
        unsubscribe: vi.fn().mockReturnValue(undefined),
      },
      mockGetCredentials: vi.fn().mockResolvedValue({
        projectId: 'project-id',
        pusherKey: 'pusher-key',
        pusherCluster: 'mt1',
      }),
      mockLoggerError: vi.fn(),
    };
  }
);

vi.mock('pusher-js', () => ({
  default: class FakePusher {
    subscribe = mockPusherClient.subscribe;
    unsubscribe = mockPusherClient.unsubscribe;
  },
}));

vi.mock('../../src/services/internal/InternalService', () => ({
  InternalService: class FakeInternalService {
    getSDKRealtimeCredentials = mockGetCredentials;
  },
}));

vi.mock('../../src/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('PusherService subscription errors', () => {
  beforeEach(() => {
    bindings.clear();
    mockGetCredentials.mockClear();
    mockPusherClient.subscribe.mockClear();
    mockLoggerError.mockClear();
  });

  it('contains subscription errors emitted after subscribe resolves', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await service.subscribe(vi.fn());

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    expect(() => {
      mockChannel.emit('pusher:subscription_error', { error: 401 });
    }).not.toThrow();

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Trigger subscription error: 401')
    );
  });
});
