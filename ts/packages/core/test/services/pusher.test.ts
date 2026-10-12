import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PusherService } from '../../src/services/pusher/Pusher';

type EventHandler = (data: Record<string, unknown>) => void;

const {
  bindings,
  mockChannel,
  mockPusherClient,
  mockGetCredentials,
  mockLoggerError,
  mockLoggerInfo,
  mockDisconnect,
  pusherConstructorOptions,
} = vi.hoisted(() => {
  const eventBindings = new Map<string, EventHandler>();
  const constructorOptions: Array<Record<string, unknown>> = [];
  const channels = new Map<string, { name: string; subscriptionCancelled: boolean }>();
  const channel = {
    bind: vi.fn((event: string, callback: EventHandler) => {
      eventBindings.set(event, callback);
    }),
    emit: (event: string, data: Record<string, unknown>) => {
      eventBindings.get(event)?.(data);
    },
  };
  const disconnect = vi.fn();

  return {
    bindings: eventBindings,
    mockChannel: channel,
    mockDisconnect: disconnect,
    mockPusherClient: {
      subscribe: vi.fn((name: string) => {
        const entry = { name, subscriptionCancelled: false };
        channels.set(name, entry);
        return channel;
      }),
      unsubscribe: vi.fn((name: string) => {
        channels.delete(name);
      }),
      allChannels: vi.fn(() => [...channels.values()]),
      disconnect,
      _channels: channels,
    },
    mockGetCredentials: vi.fn().mockResolvedValue({
      projectId: 'project-id',
      pusherKey: 'pusher-key',
      pusherCluster: 'mt1',
    }),
    mockLoggerError: vi.fn(),
    mockLoggerInfo: vi.fn(),
    pusherConstructorOptions: constructorOptions,
  };
});

vi.mock('pusher-js', () => ({
  default: class FakePusher {
    subscribe = mockPusherClient.subscribe;
    unsubscribe = mockPusherClient.unsubscribe;
    allChannels = mockPusherClient.allChannels;
    disconnect = mockPusherClient.disconnect;
    constructor(_key: string, options: Record<string, unknown>) {
      pusherConstructorOptions.push(options);
    }
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
    mockPusherClient.unsubscribe.mockClear();
    mockPusherClient.allChannels.mockClear();
    mockDisconnect.mockClear();
    mockPusherClient._channels.clear();
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

  it('contains rejections from async subscription error callbacks', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);
    const onSubscriptionError = vi.fn(async () => {
      throw new Error('async handler failed');
    });

    await service.subscribe(vi.fn(), onSubscriptionError);

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    mockChannel.emit('pusher:subscription_error', { error: 401 });

    // let the rejected promise settle and the containment log run
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    expect(onSubscriptionError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '❌ Error in subscription error callback:',
      'async handler failed'
    );
  });
});

describe('PusherService channel authorization credentials', () => {
  const baseURL = 'https://backend.composio.dev';
  const channelAuthHeaders = () => {
    const options = pusherConstructorOptions.at(-1)!;
    const channelAuthorization = options.channelAuthorization as {
      headers: Record<string, string>;
    };
    return channelAuthorization.headers;
  };

  beforeEach(() => {
    bindings.clear();
    pusherConstructorOptions.length = 0;
    mockPusherClient._channels.clear();
    mockDisconnect.mockClear();
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignAmbientKey');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends the project key of the client as x-api-key', async () => {
    const service = new PusherService({ baseURL, apiKey: 'ak_projectKey' } as never);

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-api-key': 'ak_projectKey' });
  });

  it('sends no project key and never reads COMPOSIO_API_KEY when the client key is null', async () => {
    const service = new PusherService({ baseURL, apiKey: null, userApiKey: null } as never);

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({});
    expect(JSON.stringify(pusherConstructorOptions)).not.toContain('ak_foreignAmbientKey');
  });

  it('sends the resolved user API key of the client when the project key is null', async () => {
    const service = new PusherService({
      baseURL,
      apiKey: null,
      userApiKey: 'uak_userKey',
    } as never);

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-user-api-key': 'uak_userKey' });
  });

  it('falls back to the x-user-api-key default header when the client holds no key', async () => {
    const service = new PusherService({ baseURL, apiKey: null, userApiKey: null } as never, {
      defaultHeaders: { 'X-User-Api-Key': 'uak_headerKey', 'x-request-id': 'req-1' },
    });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-user-api-key': 'uak_headerKey' });
  });
});

describe('PusherService unsubscribe disconnect', () => {
  beforeEach(() => {
    bindings.clear();
    mockGetCredentials.mockClear();
    mockPusherClient.subscribe.mockClear();
    mockPusherClient.unsubscribe.mockClear();
    mockPusherClient.allChannels.mockClear();
    mockDisconnect.mockClear();
    mockPusherClient._channels.clear();
    mockLoggerError.mockClear();
    mockLoggerInfo.mockClear();
    pusherConstructorOptions.length = 0;
  });

  it('closes the realtime connection once nothing is subscribed', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await service.subscribe(vi.fn());
    await service.unsubscribe();

    expect(mockPusherClient.unsubscribe).toHaveBeenCalledWith('private-project-id_triggers');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not create a client when unsubscribe runs with no prior subscribe', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await service.unsubscribe();

    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('creates a fresh client for a subscribe after disconnect', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await service.subscribe(vi.fn());
    await service.unsubscribe();
    await service.subscribe(vi.fn());

    expect(mockGetCredentials).toHaveBeenCalledTimes(2);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('shares one client between concurrent first subscribes', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await Promise.all([service.subscribe(vi.fn()), service.subscribe(vi.fn())]);

    expect(mockGetCredentials).toHaveBeenCalledTimes(1);
    expect(pusherConstructorOptions).toHaveLength(1);

    await service.unsubscribe();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels a subscribe that is still fetching credentials', async () => {
    let releaseCredentials!: () => void;
    mockGetCredentials.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseCredentials = () =>
            resolve({ projectId: 'project-id', pusherKey: 'pusher-key', pusherCluster: 'mt1' });
        })
    );
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    const pending = service.subscribe(vi.fn());
    await service.unsubscribe();
    releaseCredentials();
    await pending;

    expect(pusherConstructorOptions).toHaveLength(0);
    expect(mockPusherClient.subscribe).not.toHaveBeenCalled();
  });

  it('tears down a client created after unsubscribe cancelled the setup', async () => {
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    const pending = service.subscribe(vi.fn());
    // let credentials resolve so setup is waiting on the pusher-js import
    await Promise.resolve();
    await Promise.resolve();
    await service.unsubscribe();
    await pending;

    expect(mockPusherClient.subscribe).not.toHaveBeenCalled();
    expect(mockDisconnect.mock.calls.length).toBe(pusherConstructorOptions.length);
  });

  it('resolves quietly when credentials reject after unsubscribe cancelled the setup', async () => {
    let rejectCredentials!: (error: Error) => void;
    mockGetCredentials.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCredentials = reject;
        })
    );
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    const pending = service.subscribe(vi.fn());
    await service.unsubscribe();
    rejectCredentials(new Error('network down'));

    await expect(pending).resolves.toBeUndefined();
    expect(pusherConstructorOptions).toHaveLength(0);
  });

  it('still throws when credentials reject without a cancel', async () => {
    mockGetCredentials.mockRejectedValueOnce(new Error('network down'));
    const service = new PusherService({
      baseURL: 'https://backend.composio.dev',
      apiKey: 'api-key',
    } as never);

    await expect(service.subscribe(vi.fn())).rejects.toThrow(
      'Failed to subscribe to Pusher channel'
    );
  });
});
