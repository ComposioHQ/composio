import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PusherService } from '../../src/services/pusher/Pusher';
import { ComposioFailedToSubscribeToPusherChannelError } from '../../src/errors/TriggerErrors';

type EventHandler = (data: Record<string, unknown>) => void;

const {
  clients,
  createClient,
  hooks,
  mockGetCredentials,
  mockLoggerError,
  mockLoggerInfo,
  pusherConstructorOptions,
} = vi.hoisted(() => {
  // Keeps pusher-js's binding semantics: several handlers per event, all removed by unbind_all().
  class FakeChannel {
    private handlers = new Map<string, EventHandler[]>();
    bind = vi.fn((event: string, callback: EventHandler) => {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), callback]);
    });
    unbind_all = vi.fn(() => {
      this.handlers.clear();
    });
    emit(event: string, data: Record<string, unknown>) {
      for (const callback of this.handlers.get(event) ?? []) callback(data);
    }
  }

  class FakeClient {
    channel = new FakeChannel();
    subscribe = vi.fn(() => this.channel);
    unsubscribe = vi.fn();
    disconnect = vi.fn();
  }

  const createdClients: FakeClient[] = [];
  const testHooks = {
    // Runs synchronously inside the Pusher constructor.
    onClientCreated: () => {},
  };

  return {
    clients: createdClients,
    createClient: () => {
      const client = new FakeClient();
      createdClients.push(client);
      testHooks.onClientCreated();
      return client;
    },
    hooks: testHooks,
    mockGetCredentials: vi.fn(),
    mockLoggerError: vi.fn(),
    mockLoggerInfo: vi.fn(),
    pusherConstructorOptions: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('pusher-js', () => ({
  default: class FakePusher {
    constructor(_key: string, options: Record<string, unknown>) {
      pusherConstructorOptions.push(options);
      return createClient();
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

const credentials = { projectId: 'project-id', pusherKey: 'pusher-key', pusherCluster: 'mt1' };

const createService = () =>
  new PusherService({ baseURL: 'https://backend.composio.dev' } as never, { apiKey: 'api-key' });

const flushMacrotask = () =>
  new Promise<void>(resolve => {
    setImmediate(resolve);
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const triggerEvent = { id: 'evt_1' };

beforeEach(() => {
  clients.length = 0;
  pusherConstructorOptions.length = 0;
  hooks.onClientCreated = () => {};
  mockGetCredentials.mockReset().mockResolvedValue(credentials);
  mockLoggerError.mockClear();
  mockLoggerInfo.mockClear();
});

describe('PusherService subscription errors', () => {
  it('contains subscription errors emitted after subscribe resolves', async () => {
    const service = createService();

    await service.subscribe(vi.fn());

    await flushMacrotask();

    expect(() => {
      clients[0].channel.emit('pusher:subscription_error', {
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
    const service = createService();

    await service.subscribe(vi.fn());

    await flushMacrotask();

    clients[0].channel.emit('pusher:subscription_succeeded', {});

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Subscribed to triggers'));
  });

  it('invokes the optional subscription error callback with the raw payload', async () => {
    const service = createService();
    const onSubscriptionError = vi.fn();

    await service.subscribe(vi.fn(), onSubscriptionError);

    await flushMacrotask();

    const payload = { type: 'AuthError', error: 'Auth error: 401', status: 401 };
    clients[0].channel.emit('pusher:subscription_error', payload);

    expect(onSubscriptionError).toHaveBeenCalledWith(payload);
  });

  it('contains exceptions thrown from the subscription error callback', async () => {
    const service = createService();
    const onSubscriptionError = vi.fn(() => {
      throw new Error('handler exploded');
    });

    await service.subscribe(vi.fn(), onSubscriptionError);

    await flushMacrotask();

    expect(() => {
      clients[0].channel.emit('pusher:subscription_error', { error: 401 });
    }).not.toThrow();

    expect(onSubscriptionError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '❌ Error in subscription error callback:',
      'handler exploded'
    );
  });

  it('contains rejections from async subscription error callbacks', async () => {
    const service = createService();
    const onSubscriptionError = vi.fn(async () => {
      throw new Error('async handler failed');
    });

    await service.subscribe(vi.fn(), onSubscriptionError);

    await flushMacrotask();

    clients[0].channel.emit('pusher:subscription_error', { error: 401 });

    // let the rejected promise settle and the containment log run
    await flushMacrotask();

    expect(onSubscriptionError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '❌ Error in subscription error callback:',
      'async handler failed'
    );
  });

  it('contains a rejection whose value String() cannot convert', async () => {
    // String() throws on an object without a prototype; the failure log runs as a rejection
    // handler, so a throw there would escape as an unhandled rejection.
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    const unprintable = Object.create(null);
    unprintable.self = unprintable;
    const service = createService();

    try {
      await service.subscribe(vi.fn(), async () => {
        throw unprintable;
      });
      clients[0].channel.emit('pusher:subscription_error', { error: 401 });
      await flushMacrotask();

      expect(mockLoggerError).toHaveBeenCalledWith(
        '❌ Error in subscription error callback:',
        '[unprintable value]'
      );
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });
});

describe('PusherService trigger callback errors', () => {
  it('contains synchronous throws and async rejections from the trigger callback', async () => {
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    const service = createService();

    try {
      await service.subscribe(() => {
        throw new Error('sync failure');
      });
      await service.subscribe(async () => {
        throw new Error('async failure');
      });

      expect(() => clients[0].channel.emit('trigger_to_client', triggerEvent)).not.toThrow();
      await flushMacrotask();

      expect(mockLoggerError).toHaveBeenCalledWith('❌ Error in trigger callback:', 'sync failure');
      expect(mockLoggerError).toHaveBeenCalledWith(
        '❌ Error in trigger callback:',
        'async failure'
      );
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });
});

describe('PusherService connection lifecycle', () => {
  it('disconnects the client and removes its handlers on unsubscribe', async () => {
    const service = createService();
    const handler = vi.fn();
    await service.subscribe(handler);

    await service.unsubscribe();

    const [client] = clients;
    expect(client.unsubscribe).toHaveBeenCalledWith('private-project-id_triggers');
    expect(client.channel.unbind_all).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    client.channel.emit('trigger_to_client', triggerEvent);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not create a client or fetch credentials when unsubscribe comes first', async () => {
    const service = createService();

    await service.unsubscribe();
    await service.unsubscribe();

    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(clients).toHaveLength(0);
  });

  it('shares one client between concurrent subscribe calls', async () => {
    const credentialsResponse = deferred<typeof credentials>();
    mockGetCredentials.mockReturnValueOnce(credentialsResponse.promise);
    const service = createService();
    const first = vi.fn();
    const second = vi.fn();

    const subscriptions = Promise.all([service.subscribe(first), service.subscribe(second)]);
    credentialsResponse.resolve(credentials);
    await subscriptions;

    expect(mockGetCredentials).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(1);
    clients[0].channel.emit('trigger_to_client', triggerEvent);
    expect(first).toHaveBeenCalledWith(triggerEvent);
    expect(second).toHaveBeenCalledWith(triggerEvent);

    await service.unsubscribe();
    expect(clients[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels a subscribe that is still waiting for credentials', async () => {
    const credentialsResponse = deferred<typeof credentials>();
    mockGetCredentials.mockReturnValueOnce(credentialsResponse.promise);
    const service = createService();

    const subscription = service.subscribe(vi.fn());
    await service.unsubscribe();
    credentialsResponse.resolve(credentials);

    await expect(subscription).resolves.toBeUndefined();
    expect(clients).toHaveLength(0);
  });

  it('does not report a credentials failure for a subscribe cancelled by unsubscribe', async () => {
    const credentialsResponse = deferred<typeof credentials>();
    mockGetCredentials.mockReturnValueOnce(credentialsResponse.promise);
    const service = createService();

    const subscription = service.subscribe(vi.fn());
    await service.unsubscribe();
    credentialsResponse.reject(new Error('network down'));

    await expect(subscription).resolves.toBeUndefined();
    expect(clients).toHaveLength(0);
  });

  it('does not install handlers when unsubscribe runs after the client was created', async () => {
    const service = createService();
    const handler = vi.fn();
    // Runs unsubscribe() after the client exists but before the waiting subscribe() resumes.
    const created = new Promise<void>(resolve => {
      hooks.onClientCreated = resolve;
    });

    const subscription = service.subscribe(handler);
    await created;
    await service.unsubscribe();
    await subscription;

    const [client] = clients;
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.channel.bind).not.toHaveBeenCalled();
  });

  it('keeps the later subscribe when unsubscribe interleaves with pending setup', async () => {
    const staleCredentials = deferred<typeof credentials>();
    mockGetCredentials.mockReturnValueOnce(staleCredentials.promise);
    const service = createService();
    const staleHandler = vi.fn();
    const liveHandler = vi.fn();

    const stale = service.subscribe(staleHandler);
    await service.unsubscribe();
    await service.subscribe(liveHandler);
    staleCredentials.resolve(credentials);
    await stale;

    expect(clients).toHaveLength(1);
    clients[0].channel.emit('trigger_to_client', triggerEvent);
    expect(liveHandler).toHaveBeenCalledTimes(1);
    expect(staleHandler).not.toHaveBeenCalled();

    await service.unsubscribe();
    expect(clients[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh connection for a subscribe after unsubscribe', async () => {
    const service = createService();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    await service.subscribe(firstHandler);
    await service.unsubscribe();
    await service.subscribe(secondHandler);

    expect(clients).toHaveLength(2);
    const [oldClient, newClient] = clients;
    // A late event or auth reply on the old client reaches nothing.
    oldClient.channel.emit('trigger_to_client', triggerEvent);
    oldClient.channel.emit('pusher:subscription_error', { error: 401 });
    newClient.channel.emit('trigger_to_client', triggerEvent);
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(newClient.disconnect).not.toHaveBeenCalled();
  });

  it('leaves no connected client or bound handler behind after repeated cycles', async () => {
    const service = createService();

    for (let cycle = 0; cycle < 5; cycle++) {
      await service.subscribe(vi.fn());
      await service.unsubscribe();
    }

    expect(clients).toHaveLength(5);
    for (const client of clients) {
      expect(client.channel.bind).toHaveBeenCalled();
      expect(client.channel.unbind_all).toHaveBeenCalledTimes(1);
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    }
  });

  it('retries after a credentials failure', async () => {
    mockGetCredentials.mockRejectedValueOnce(new Error('network down'));
    const service = createService();

    await expect(service.subscribe(vi.fn())).rejects.toBeInstanceOf(
      ComposioFailedToSubscribeToPusherChannelError
    );
    await service.subscribe(vi.fn());

    expect(mockGetCredentials).toHaveBeenCalledTimes(2);
    expect(clients).toHaveLength(1);
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
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignAmbientKey');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends the project key the SDK resolved as x-api-key', async () => {
    const service = new PusherService({ baseURL } as never, { apiKey: 'ak_projectKey' });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-api-key': 'ak_projectKey' });
  });

  it('sends no project key and never reads COMPOSIO_API_KEY when the SDK key is null', async () => {
    const service = new PusherService({ baseURL } as never, { apiKey: null, userApiKey: null });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({});
    expect(JSON.stringify(pusherConstructorOptions)).not.toContain('ak_foreignAmbientKey');
  });

  it('sends the user API key the SDK resolved when the project key is null', async () => {
    const service = new PusherService({ baseURL } as never, {
      apiKey: null,
      userApiKey: 'uak_userKey',
    });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-user-api-key': 'uak_userKey' });
  });

  it('sends the organization API key when it is the only key the SDK resolved', async () => {
    const service = new PusherService({ baseURL } as never, {
      apiKey: null,
      userApiKey: null,
      orgApiKey: 'oak_orgKey',
    });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-org-api-key': 'oak_orgKey' });
  });

  it('never reads a key back from the API client', async () => {
    const client = {
      baseURL,
      get apiKey(): string {
        throw new Error('client.apiKey must not be read');
      },
      get userApiKey(): string {
        throw new Error('client.userApiKey must not be read');
      },
    };
    const service = new PusherService(client as never, { apiKey: 'ak_sdkKey' });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-api-key': 'ak_sdkKey' });
  });

  it('falls back to the x-user-api-key default header when the SDK holds no key', async () => {
    const service = new PusherService({ baseURL } as never, {
      apiKey: null,
      userApiKey: null,
      defaultHeaders: { 'X-User-Api-Key': 'uak_headerKey', 'x-request-id': 'req-1' },
    });

    await service.subscribe(vi.fn());

    expect(channelAuthHeaders()).toEqual({ 'x-user-api-key': 'uak_headerKey' });
  });
});
