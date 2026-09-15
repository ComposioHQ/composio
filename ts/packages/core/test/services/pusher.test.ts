import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PusherService } from '../../src/services/pusher/Pusher';

type EventHandler = (data: Record<string, unknown>) => void;

const {
  bindings,
  mockChannel,
  mockPusherClient,
  mockGetCredentials,
  mockLoggerError,
  mockLoggerInfo,
} = vi.hoisted(() => {
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
    mockLoggerInfo: vi.fn(),
  };
});

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
    info: mockLoggerInfo,
    warn: vi.fn(),
  },
}));

describe('PusherService subscription errors', () => {
  beforeEach(() => {
    bindings.clear();
    mockGetCredentials.mockClear();
    mockPusherClient.subscribe.mockClear();
    mockLoggerError.mockClear();
    mockLoggerInfo.mockClear();
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
      mockChannel.emit('pusher:subscription_error', {
        type: 'AuthError',
        error: 'Auth error: 401',
        status: 401,
      });
    }).not.toThrow();

    expect(mockLoggerError).toHaveBeenCalledWith('Trigger subscription error:', {
      type: 'AuthError',
      error: 'Auth error: 401',
      status: 401,
    });
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it('logs success only after pusher confirms the subscription', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await service.subscribe(vi.fn());

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    mockChannel.emit('pusher:subscription_succeeded', {});

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Subscribed to triggers'));
  });

  it('invokes the optional subscription error callback with the raw payload', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);
    const onSubscriptionError = vi.fn();

    await service.subscribe(vi.fn(), onSubscriptionError);

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    const payload = { type: 'AuthError', error: 'Auth error: 401', status: 401 };
    mockChannel.emit('pusher:subscription_error', payload);

    expect(onSubscriptionError).toHaveBeenCalledWith(payload);
  });

  it('contains exceptions thrown from the subscription error callback', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);
    const onSubscriptionError = vi.fn(() => {
      throw new Error('handler exploded');
    });

    await service.subscribe(vi.fn(), onSubscriptionError);

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    expect(() => {
      mockChannel.emit('pusher:subscription_error', { error: 401 });
    }).not.toThrow();

    expect(onSubscriptionError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '❌ Error in subscription error callback:',
      'handler exploded'
    );
  });
});
