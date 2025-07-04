import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConnectionRequest } from '../../src/models/ConnectionRequest';
import { ConnectionRequest } from '../../src/types/connectionRequest.types';
import ComposioClient, { ComposioError } from '@composio/client';
import { ConnectionRequestTimeoutError } from '../../src/errors';
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
    vi.clearAllMocks();
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
