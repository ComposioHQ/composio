import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PusherService } from '../../src/services/pusher/Pusher';

const { pusherConstructorOptions } = vi.hoisted(() => ({
  pusherConstructorOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock('pusher-js', () => ({
  default: class FakePusher {
    subscribe = vi.fn(async () => ({ bind: vi.fn() }));
    unsubscribe = vi.fn();
    constructor(_key: string, options: Record<string, unknown>) {
      pusherConstructorOptions.push(options);
    }
  },
}));

vi.mock('../../src/services/internal/InternalService', () => ({
  InternalService: class {
    getSDKRealtimeCredentials = vi.fn(async () => ({
      pusherKey: 'pusher_key',
      projectId: 'project_1',
      pusherCluster: 'eu',
    }));
  },
}));

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
