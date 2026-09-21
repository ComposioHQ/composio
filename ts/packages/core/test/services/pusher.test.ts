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
  pusherConstructorOptions,
} = vi.hoisted(() => {
  const eventBindings = new Map<string, EventHandler>();
  const constructorOptions: Array<Record<string, unknown>> = [];
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
    pusherConstructorOptions: constructorOptions,
  };
});

vi.mock('pusher-js', () => ({
  default: class FakePusher {
    subscribe = mockPusherClient.subscribe;
    unsubscribe = mockPusherClient.unsubscribe;
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
    const service = new PusherService({ baseURL, apiKey: null } as never);

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({});
    expect(JSON.stringify(pusherConstructorOptions)).not.toContain('ak_foreignAmbientKey');
  });

  it('sends the user API key header instead when the client key is null', async () => {
    const service = new PusherService({ baseURL, apiKey: null } as never, {
      defaultHeaders: { 'X-User-Api-Key': 'uak_userKey', 'x-request-id': 'req-1' },
    });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-user-api-key': 'uak_userKey' });
  });
});
