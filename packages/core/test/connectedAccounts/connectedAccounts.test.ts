import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { ConnectedAccounts } from '../../src/models/ConnectedAccounts';
import ComposioClient from '@composio/client';
import { ConnectionRequest } from '../../src/models/ConnectionRequest';
import { ConnectedAccountRetrieveResponse } from '@composio/client/resources/connected-accounts.mjs';

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
      const mockResponse = { items: [], totalPages: 0 };

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.list(query);

      expect(extendedMockClient.connectedAccounts.list).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResponse);
    });

    it('should call client.connectedAccounts.list without query if none provided', async () => {
      const mockResponse = { items: [], totalPages: 0 };

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.list();

      expect(extendedMockClient.connectedAccounts.list).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('initiate', () => {
    it('should create a new connected account and return a ConnectionRequest and wait for it to be active', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {
        data: { name: 'Test Account' },
        redirectUrl: 'https://example.com/callback',
      };

      const mockResponse = {
        id: 'conn_123',
        status: 'pending',
        redirect_uri: 'https://auth.example.com/connect',
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId, options);

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          data: options.data,
          redirect_uri: options.redirectUrl,
          user_id: userId,
        },
      });

      expect(connectionRequest).toBeInstanceOf(ConnectionRequest);
      expect(connectionRequest).toHaveProperty('id', mockResponse.id);
      expect(connectionRequest).toHaveProperty('status', mockResponse.status);
      expect(connectionRequest).toHaveProperty('redirectUrl', mockResponse.redirect_uri);

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
        redirect_uri: 'https://auth.example.com/connect',
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.initiate(userId, authConfigId);

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          data: undefined,
          redirect_uri: undefined,
          user_id: userId,
        },
      });

      expect(result).toBeInstanceOf(ConnectionRequest);
    });
  });

  describe('get', () => {
    it('should retrieve a connected account by nanoid', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, name: 'Test Account' };

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.get(nanoid);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual(mockResponse);
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
});
