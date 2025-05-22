import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { ConnectedAccounts } from '../../src/models/ConnectedAccounts';
import ComposioClient from '@composio/client';
import { ConnectionRequest } from '../../src/models/ConnectionRequest';
import { ConnectedAccountRetrieveResponse } from '@composio/client/resources/connected-accounts.mjs';
import { ComposioConnectedAccountNotFoundError } from '../../src/errors';

// Extend the mock client object for ConnectedAccounts testing
const extendedMockClient = {
  ...mockClient,
  connectedAccounts: {
    ...mockClient.connectedAccounts,
    create: vi.fn(),
    retrieve: vi.fn(),
    delete: vi.fn(),
    refresh: vi.fn(),
    updateStatus: vi.fn(),
  },
};

describe('ConnectedAccounts', () => {
  let connectedAccounts: ConnectedAccounts;

  beforeEach(() => {
    vi.clearAllMocks();
    connectedAccounts = new ConnectedAccounts(extendedMockClient as unknown as ComposioClient);
  });

  describe('constructor', () => {
    it('should create an instance successfully with valid client', () => {
      expect(connectedAccounts).toBeInstanceOf(ConnectedAccounts);
    });

    it('should not throw an error if client is provided', () => {
      expect(
        () => new ConnectedAccounts(extendedMockClient as unknown as ComposioClient)
      ).not.toThrow();
    });
  });

  describe('list', () => {
    it('should call client.connectedAccounts.list with the provided query', async () => {
      const query = { limit: 10 };
      const mockResponse = { items: [], next_cursor: null, total_pages: 0 };

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.list(query);

      expect(extendedMockClient.connectedAccounts.list).toHaveBeenCalledWith(query);
      expect(result).toEqual({
        items: [],
        nextCursor: null,
        totalPages: 0,
      });
    });

    it('should call client.connectedAccounts.list without query if none provided', async () => {
      const mockResponse = { items: [], total_pages: 0, next_cursor: null };

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.list();

      expect(extendedMockClient.connectedAccounts.list).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({
        items: [],
        nextCursor: null,
        totalPages: 0,
      });
    });
  });

  describe('initiate', () => {
    it('should create a new connected account and return a ConnectionRequest and wait for it to be active', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {
        data: { name: 'Test Account' },
        callbackUrl: 'https://example.com/callback',
      };

      const mockResponse = {
        id: 'conn_123',
        status: 'pending',
        redirect_url: 'https://auth.example.com/connect',
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId, options);

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          data: options.data,
          callback_url: options.callbackUrl,
          user_id: userId,
        },
      });

      expect(connectionRequest).toBeInstanceOf(ConnectionRequest);
      expect(connectionRequest).toHaveProperty('id', mockResponse.id);
      expect(connectionRequest).toHaveProperty('status', mockResponse.status);
      expect(connectionRequest).toHaveProperty('redirectUrl', mockResponse.redirect_url);

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce({
        id: 'nanoid',
        status: 'ACTIVE',
        auth_scopes: ['read:user', 'write:user'],
        auth_config: {
          id: authConfigId,
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        user_id: userId,
        data: {},
        params: {},
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: null,
        toolkit: {
          slug: 'test-toolkit',
        },
      } as unknown as ConnectedAccountRetrieveResponse);

      const connectedAccount = await connectionRequest.waitForConnection();

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(mockResponse.id);
      expect(connectedAccount).toHaveProperty('id', 'nanoid');
      expect(connectedAccount).toHaveProperty('status', 'ACTIVE');
    });

    it('should work without optional parameters', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      const mockResponse = {
        id: 'conn_123',
        status: 'pending',
        callback_url: 'https://auth.example.com/connect',
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.initiate(userId, authConfigId);

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          data: undefined,
          callback_url: undefined,
          user_id: userId,
        },
      });

      expect(result).toBeInstanceOf(ConnectionRequest);
    });
  });

  describe('get', () => {
    it('should retrieve a connected account by nanoid and transform the response', async () => {
      const nanoid = 'conn_123';
      const mockResponse = {
        id: 'nanoid',
        status: 'ACTIVE',
        auth_scopes: ['read:user', 'write:user'],
        auth_config: {
          id: 'test-auth-config',
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

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.get(nanoid);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual({
        id: 'nanoid',
        status: 'ACTIVE',
        authConfig: {
          id: 'test-auth-config',
          authScheme: 'OAUTH2',
          isComposioManaged: true,
          isDisabled: false,
        },
        userId: 'user_123',
        data: {},
        params: {},
        statusReason: null,
        isDisabled: false,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        toolkit: {
          slug: 'test-toolkit',
        },
        testRequestEndpoint: undefined,
      });
    });
  });

  describe('delete', () => {
    it('should delete a connected account by nanoid', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { success: true };

      extendedMockClient.connectedAccounts.delete.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.delete(nanoid);

      expect(extendedMockClient.connectedAccounts.delete).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('refresh', () => {
    it('should refresh a connected account by nanoid', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, refreshed: true };

      extendedMockClient.connectedAccounts.refresh.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.refresh(nanoid);

      expect(extendedMockClient.connectedAccounts.refresh).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateStatus', () => {
    it('should update the status of a connected account', async () => {
      const nanoid = 'conn_123';
      const params = { enabled: true };
      const mockResponse = { id: nanoid, enabled: true };

      extendedMockClient.connectedAccounts.updateStatus.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.updateStatus(nanoid, params);

      expect(extendedMockClient.connectedAccounts.updateStatus).toHaveBeenCalledWith(
        nanoid,
        params
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('enable', () => {
    it('should enable a connected account', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, enabled: true };

      extendedMockClient.connectedAccounts.updateStatus.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.enable(nanoid);

      expect(extendedMockClient.connectedAccounts.updateStatus).toHaveBeenCalledWith(nanoid, {
        enabled: true,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('disable', () => {
    it('should disable a connected account', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, enabled: false };

      extendedMockClient.connectedAccounts.updateStatus.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.disable(nanoid);

      expect(extendedMockClient.connectedAccounts.updateStatus).toHaveBeenCalledWith(nanoid, {
        enabled: false,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('waitForConnection', () => {
    it('should wait for a connected account to become active', async () => {
      const nanoid = 'conn_123';
      const authConfigId = 'auth_config_123';
      const mockGetResponse = {
        id: nanoid,
        status: 'PENDING',
        auth_scopes: ['read:user', 'write:user'],
        auth_config: {
          id: authConfigId,
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
      } as unknown as ConnectedAccountRetrieveResponse;

      const mockActiveResponse = {
        ...mockGetResponse,
        status: 'ACTIVE',
      } as unknown as ConnectedAccountRetrieveResponse;

      // Mock the get method first call
      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockGetResponse);
      // Mock the subsequent call in waitForConnection
      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockActiveResponse);

      const result = await connectedAccounts.waitForConnection(nanoid);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual(
        connectedAccounts.transformConnectedAccountResponse(mockActiveResponse)
      );
    });

    it('should throw ComposioConnectedAccountNotFoundError if connected account does not exist', async () => {
      const nanoid = 'non_existent_conn';

      extendedMockClient.connectedAccounts.retrieve.mockRejectedValueOnce(
        new ComposioClient.NotFoundError(404, undefined, undefined, {} as Headers)
      );

      try {
        await connectedAccounts.waitForConnection(nanoid);
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioConnectedAccountNotFoundError);
      }
    });

    it('should use the provided timeout value', async () => {
      const nanoid = 'conn_123';
      const timeout = 30000;
      const mockGetResponse = {
        id: nanoid,
        status: 'PENDING',
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
        auth_scopes: ['read:user'],
        toolkit: {
          slug: 'test-toolkit',
        },
      } as unknown as ConnectedAccountRetrieveResponse;

      const mockActiveResponse = {
        ...mockGetResponse,
        status: 'ACTIVE',
      } as unknown as ConnectedAccountRetrieveResponse;

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockGetResponse);
      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockActiveResponse);

      const result = await connectedAccounts.waitForConnection(nanoid, timeout);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual(
        connectedAccounts.transformConnectedAccountResponse(mockActiveResponse)
      );
    });
  });
});
