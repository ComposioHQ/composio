import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PusherUtils } from '../../src/utils/pusher';

// Capture the options passed to the Pusher constructor so the
// channelAuthorization.customHandler can be exercised in isolation.
const { constructorCalls } = vi.hoisted(() => ({
  constructorCalls: [] as Array<{ key: string; options: Record<string, any> }>,
}));

vi.mock('pusher-js', () => {
  class FakePusher {
    connection = { bind: vi.fn() };
    subscribe = vi.fn();
    unsubscribe = vi.fn();
    bind = vi.fn();
    constructor(key: string, options: Record<string, any>) {
      constructorCalls.push({ key, options });
    }
  }
  return { default: FakePusher };
});

type CustomHandler = (
  params: { socketId: string; channelName: string },
  callback: (error: Error | null, data: unknown) => void
) => void;

const baseURL = 'https://backend.composio.dev';
const apiKey = 'test-api-key';
const authEndpoint = `${baseURL}/api/v3/internal/sdk/realtime/auth`;

async function getCustomHandler(): Promise<CustomHandler> {
  await PusherUtils.getPusherClient(baseURL, apiKey);
  const { options } = constructorCalls.at(-1)!;
  return options.channelAuthorization.customHandler as CustomHandler;
}

describe('PusherUtils channelAuthorization', () => {
  beforeEach(() => {
    constructorCalls.length = 0;
    // Reset the cached singleton so getPusherClient rebuilds the client.
    (PusherUtils as unknown as { pusherClient?: unknown }).pusherClient = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('configures the realtime auth endpoint with ajax transport', async () => {
    await PusherUtils.getPusherClient(baseURL, apiKey);
    const { options } = constructorCalls.at(-1)!;

    expect(options.channelAuthorization.endpoint).toBe(authEndpoint);
    expect(options.channelAuthorization.transport).toBe('ajax');
    expect(typeof options.channelAuthorization.customHandler).toBe('function');
  });

  it('POSTs socket_id/channel_name as JSON and returns the parsed auth payload', async () => {
    const authData = { auth: 'app_key:signature' };
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => JSON.stringify(authData) });
    vi.stubGlobal('fetch', fetchMock);

    const customHandler = await getCustomHandler();
    const callback = vi.fn();
    customHandler({ socketId: '123.456', channelName: 'private-abc' }, callback);

    await vi.waitFor(() => expect(callback).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      authEndpoint,
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ socket_id: '123.456', channel_name: 'private-abc' }),
      })
    );
    expect(callback).toHaveBeenCalledWith(null, authData);
  });

  it('reports an error to the callback when the response is not valid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => 'not-json' });
    vi.stubGlobal('fetch', fetchMock);

    const customHandler = await getCustomHandler();
    const callback = vi.fn();
    customHandler({ socketId: '1', channelName: 'c' }, callback);

    await vi.waitFor(() => expect(callback).toHaveBeenCalled());

    const [error, data] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(data).toBeNull();
  });

  it('reports an error to the callback when the auth request rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const customHandler = await getCustomHandler();
    const callback = vi.fn();
    customHandler({ socketId: '1', channelName: 'c' }, callback);

    await vi.waitFor(() => expect(callback).toHaveBeenCalled());

    const [error, data] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('network down');
    expect(data).toBeNull();
  });
});
