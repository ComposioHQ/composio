import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConnectionRequest } from '../../src/models/ConnectionRequest';
import { ConnectionRequest } from '../../src/types/connectionRequest.types';
import ComposioClient, {
  APIError,
  Auth,
  ComposioError,
  createFetchTransport,
  RateLimitError,
} from '@composio/client';
import {
  ComposioConnectedAccountNotFoundError,
  ConnectionRequestFailedError,
  ConnectionRequestTimeoutError,
} from '../../src/errors';
import { ConnectedAccountStatuses } from '../../src/types/connectedAccounts.types';
import { AuthSchemeTypes } from '../../src/types/authConfigs.types';

// Mock ComposioClient
const mockClient = {
  connectedAccounts: {
    retrieve: vi.fn(),
  },
};

describe('ConnectionRequest', () => {
  let connectionRequest: ConnectionRequest;
  const connectedAccountId = 'conn_123';
  const redirectUrl = 'https://example.com/callback';

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset timers before each test
    vi.useRealTimers();
  });

  describe('createConnectionRequest', () => {
    it('should create an instance with an INITIATED status', () => {
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      expect(connectionRequest).toHaveProperty('id', connectedAccountId);
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty('redirectUrl', redirectUrl);
    });

    it('should create an instance without a callbackUrl', () => {
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId
      );

      expect(connectionRequest).toHaveProperty('redirectUrl', undefined);
    });

    it('should keep its fields assignable and reflected in toJSON()', () => {
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId
      );

      connectionRequest.redirectUrl = redirectUrl;

      expect(connectionRequest.toJSON()).toEqual({
        id: connectedAccountId,
        status: ConnectedAccountStatuses.INITIATED,
        redirectUrl,
      });
    });
  });

  describe('waitForConnection', () => {
    it('should immediately resolve if status is already ACTIVE', async () => {
      // Create the connection request with ACTIVE status
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.ACTIVE,
        redirectUrl
      );

      // Mock the retrieve response
      const mockResponse = {
        id: connectedAccountId,
        status: ConnectedAccountStatuses.ACTIVE,
        auth_config: {
          id: 'auth_config_123',
          is_composio_managed: true,
          is_disabled: false,
        },
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
          val: {
            status: 'ACTIVE',
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
        },
        user_id: 'user_123',
        data: {},
        params: {},
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: null,
        toolkit: {
          slug: 'test-toolkit',
        },
      };

      mockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await connectionRequest.waitForConnection();

      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(connectedAccountId);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('id', connectedAccountId);
      expect(result).toHaveProperty('status', ConnectedAccountStatuses.ACTIVE);
      expect(result).toHaveProperty('state.authScheme', 'OAUTH2');
    });

    it('should report ACTIVE on the request once waitForConnection resolves', async () => {
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );
      mockClient.connectedAccounts.retrieve.mockResolvedValueOnce({
        id: connectedAccountId,
        status: ConnectedAccountStatuses.ACTIVE,
        auth_config: {
          id: 'auth_config_123',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        user_id: 'user_123',
        data: {},
        params: {},
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: null,
        toolkit: {
          slug: 'test-toolkit',
        },
      });

      await connectionRequest.waitForConnection();

      expect(connectionRequest.status).toBe(ConnectedAccountStatuses.ACTIVE);
      expect(connectionRequest.toJSON().status).toBe(ConnectedAccountStatuses.ACTIVE);
      expect(JSON.parse(connectionRequest.toString()).status).toBe(ConnectedAccountStatuses.ACTIVE);
    });

    it('should poll until status becomes ACTIVE', async () => {
      // Use fake timers to control timing
      vi.useFakeTimers();

      // Create the connection request with INITIATED status
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      // Mock initial "initiated" response
      const pendingResponse = {
        id: connectedAccountId,
        status: ConnectedAccountStatuses.INITIATED,
        auth_config: {
          id: 'auth_config_123',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        user_id: 'user_123',
        data: {},
        params: {},
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: null,
        toolkit: {
          slug: 'test-toolkit',
        },
      };

      // Mock "active" response for the second call
      const activeResponse = {
        ...pendingResponse,
        status: ConnectedAccountStatuses.ACTIVE,
      };

      mockClient.connectedAccounts.retrieve
        .mockResolvedValueOnce(pendingResponse)
        .mockResolvedValueOnce(activeResponse);

      // Start the waitForConnection call but don't await it yet
      const connectionPromise = connectionRequest.waitForConnection();

      // Advance timer by 1 second (first poll)
      await vi.advanceTimersByTimeAsync(1000);

      // Advance timer by 1 more second (second poll)
      await vi.advanceTimersByTimeAsync(1000);

      // Resolve the promise
      const result = await connectionPromise;

      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(connectedAccountId);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('id', connectedAccountId);
      expect(result).toHaveProperty('status', ConnectedAccountStatuses.ACTIVE);
      expect(connectionRequest.status).toBe(ConnectedAccountStatuses.ACTIVE);
    });

    it('should throw ConnectionRequestTimeoutError if the request times out', async () => {
      // Create connection request with INITIATED status
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      // Mock initiated response that never changes to active
      const initiatedResponse = {
        id: connectedAccountId,
        status: ConnectedAccountStatuses.INITIATED,
        auth_config: {
          id: 'auth_config_123',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        user_id: 'user_123',
        data: {},
        params: {},
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: null,
        toolkit: {
          slug: 'test-toolkit',
        },
      };

      mockClient.connectedAccounts.retrieve.mockResolvedValue(initiatedResponse);

      // Start the waitForConnection call with a short timeout
      try {
        await connectionRequest.waitForConnection(3000);
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectionRequestTimeoutError);
      }
    });

    it('should reject if the API call fails', async () => {
      // Use fake timers to control timing
      vi.useFakeTimers();

      // Create connection request with INITIATED status
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      // Mock the API call to fail
      const apiError = new ComposioError('API error');
      mockClient.connectedAccounts.retrieve.mockRejectedValueOnce(apiError);

      // Start the waitForConnection call but don't await it yet
      const connectionPromise = connectionRequest.waitForConnection(50000);

      // Now check for the rejection
      await expect(connectionPromise).rejects.toBe(apiError);
    });

    it('should fail when the connection is revoked while polling', async () => {
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      const revokedResponse = {
        id: connectedAccountId,
        status: ConnectedAccountStatuses.REVOKED,
        status_reason: 'revoked by user',
      };
      mockClient.connectedAccounts.retrieve.mockResolvedValueOnce(revokedResponse);

      await expect(connectionRequest.waitForConnection(3000)).rejects.toThrow(
        ConnectionRequestFailedError
      );
      expect(connectionRequest.status).toBe(ConnectedAccountStatuses.REVOKED);
      expect(connectionRequest.toJSON().status).toBe(ConnectedAccountStatuses.REVOKED);
    });
  });

  describe('waitForConnection polling', () => {
    const pending = { id: connectedAccountId, status: ConnectedAccountStatuses.INITIATED };
    const rateLimited = (headers: Record<string, string> = {}) =>
      new RateLimitError(429, undefined, 'slow down', new Headers(headers));
    const start = (timeout?: number) => {
      vi.useFakeTimers();
      const request = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId
      );
      const result = request.waitForConnection(timeout).catch(error => error);
      return result;
    };

    /** Times of each poll, in ms since the wait started, up to `until`. */
    const pollTimes = async (until: number) => {
      const started = Date.now();
      const times: number[] = [];
      mockClient.connectedAccounts.retrieve.mockImplementation(async () => {
        times.push(Date.now() - started);
        return pending;
      });
      const result = start(until);
      await vi.advanceTimersByTimeAsync(until);
      return { times, result };
    };

    it('backs off from 1s to a 5s cap', async () => {
      vi.useFakeTimers();
      const { times, result } = await pollTimes(30000);

      expect(await result).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(times.slice(0, 7)).toEqual([0, 1000, 2500, 4750, 8125, 13125, 18125]);
    });

    it('sends about 16 requests in the default 60s wait', async () => {
      vi.useFakeTimers();
      const { times, result } = await pollTimes(60000);

      expect(await result).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(times).toHaveLength(16);
    });

    it('polls one last time at the deadline', async () => {
      vi.useFakeTimers();
      const { times, result } = await pollTimes(3000);

      expect(await result).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(times).toEqual([0, 1000, 2500, 3000]);
    });

    it('waits as long as a 429 asks, then keeps polling', async () => {
      mockClient.connectedAccounts.retrieve
        .mockRejectedValueOnce(rateLimited({ 'retry-after': '10' }))
        .mockResolvedValueOnce({
          ...pending,
          status: ConnectedAccountStatuses.ACTIVE,
          auth_config: { id: 'a', auth_scheme: 'OAUTH2', is_composio_managed: true },
          data: {},
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          status_reason: null,
          toolkit: { slug: 'test-toolkit' },
        });

      const result = start();
      await vi.advanceTimersByTimeAsync(9999);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(2);
      expect(await result).toHaveProperty('status', ConnectedAccountStatuses.ACTIVE);
    });

    it('stops its own delay at the timeout after a 429', async () => {
      mockClient.connectedAccounts.retrieve.mockRejectedValue(rateLimited({ 'retry-after': '60' }));

      const result = start(5000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(await result).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(2);
    });

    it('times out after one poll on a NaN timeout', async () => {
      mockClient.connectedAccounts.retrieve.mockResolvedValue(pending);

      expect(await start(NaN)).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(1);
    });

    it('keeps polling on an infinite timeout', async () => {
      mockClient.connectedAccounts.retrieve.mockResolvedValue(pending);

      void start(Infinity);
      await vi.advanceTimersByTimeAsync(2500);

      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(3);
    });

    it('reads a date-format Retry-After', async () => {
      vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
      mockClient.connectedAccounts.retrieve
        .mockRejectedValueOnce(rateLimited({ 'retry-after': 'Thu, 01 Jan 2026 00:00:10 GMT' }))
        .mockRejectedValue(new APIError(500, undefined, 'stop', new Headers()));

      const result = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId
      )
        .waitForConnection()
        .catch(error => error);
      await vi.advanceTimersByTimeAsync(9999);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(2);
      await result;
    });

    it('runs past the timeout while the real client retries a 429', async () => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(JSON.stringify({ error: { message: 'slow down' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '3' },
          })
      );
      const client = new ComposioClient({
        auth: Auth.project('test-api-key'),
        baseURL: 'https://backend.invalid',
        transport: createFetchTransport({ fetch }),
      });
      let settled = false;
      const result = createConnectionRequest(client, connectedAccountId)
        .waitForConnection(1000)
        .catch(error => error)
        .finally(() => {
          settled = true;
        });

      await vi.advanceTimersByTimeAsync(5999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('keeps its usual delay when a 429 has no usable Retry-After', async () => {
      mockClient.connectedAccounts.retrieve.mockRejectedValue(
        rateLimited({ 'retry-after': 'soon' })
      );

      const result = start(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(await result).toBeInstanceOf(ConnectionRequestTimeoutError);
      expect(mockClient.connectedAccounts.retrieve).toHaveBeenCalledTimes(2);
    });

    it('still fails on other API errors', async () => {
      const serverError = new APIError(500, undefined, 'boom', new Headers());
      mockClient.connectedAccounts.retrieve.mockRejectedValueOnce(serverError);

      expect(await start()).toBe(serverError);
    });

    it('reports a connection deleted mid-wait as not found', async () => {
      mockClient.connectedAccounts.retrieve
        .mockResolvedValueOnce(pending)
        .mockRejectedValueOnce(
          new ComposioClient.NotFoundError(404, undefined, 'gone', new Headers())
        );

      const result = start();
      await vi.advanceTimersByTimeAsync(1000);

      expect(await result).toBeInstanceOf(ComposioConnectedAccountNotFoundError);
    });
  });

  describe('serialization methods', () => {
    it('should return a JSON-serializable object with toJSON()', () => {
      // Create a connection request instance
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      const jsonObj = connectionRequest.toJSON();

      expect(jsonObj).toHaveProperty('id', connectedAccountId);
      expect(jsonObj).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(jsonObj).toHaveProperty('redirectUrl', redirectUrl);
    });

    it('should return a formatted JSON string with toString()', () => {
      // Create a connection request instance
      connectionRequest = createConnectionRequest(
        mockClient as unknown as ComposioClient,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED,
        redirectUrl
      );

      const jsonString = connectionRequest.toString();
      expect(typeof jsonString).toBe('string');

      const parsedObj = JSON.parse(jsonString);
      expect(parsedObj).toHaveProperty('id', connectedAccountId);
      expect(parsedObj).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(parsedObj).toHaveProperty('redirectUrl', redirectUrl);
    });
  });
});
