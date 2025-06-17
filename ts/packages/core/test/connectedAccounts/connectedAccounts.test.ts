import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { ConnectedAccounts } from '../../src/models/ConnectedAccounts';
import ComposioClient from '@composio/client';
import { ConnectionRequest } from '../../src/models/ConnectionRequest';
import { ConnectedAccountRetrieveResponse } from '@composio/client/resources/connected-accounts.mjs';
import { ComposioConnectedAccountNotFoundError } from '../../src/errors';
import { ConnectionStatusEnum } from '../../src/types/connectedAccountAuthStates.types';
import {
  ConnectedAccountAuthSchemes,
  ConnectedAccountStatuses,
} from '../../src/types/connectedAccounts.types';
import { ComposioMultipleConnectedAccountsError } from '../../src/errors';

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
        callbackUrl: 'https://example.com/callback',
      };

      // Mock list response to return empty list
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            authScheme: ConnectedAccountAuthSchemes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId, options);

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          user_id: userId,
          callback_url: options.callbackUrl,
          state: undefined,
        },
      });

      expect(connectionRequest).toBeInstanceOf(ConnectionRequest);
    });

    it('should work without optional parameters', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      // Mock list response to return empty list
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            authScheme: ConnectedAccountAuthSchemes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId);

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          user_id: userId,
          callback_url: undefined,
          state: undefined,
        },
      });

      expect(connectionRequest).toBeInstanceOf(ConnectionRequest);
    });

    it('should throw ComposioMultipleConnectedAccountsError when multiple accounts exist and allowMultiple is false', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      // Mock list response to return multiple accounts
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [
          {
            id: 'conn_1',
            status: ConnectedAccountStatuses.ACTIVE,
            auth_config: {
              id: authConfigId,
              is_composio_managed: true,
              is_disabled: false,
            },
            data: {},
            params: {},
            status_reason: null,
            toolkit: {
              slug: 'test-toolkit',
              name: 'Test Toolkit',
            },
            is_disabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'conn_2',
            status: ConnectedAccountStatuses.ACTIVE,
            auth_config: {
              id: authConfigId,
              is_composio_managed: true,
              is_disabled: false,
            },
            data: {},
            params: {},
            status_reason: null,
            toolkit: {
              slug: 'test-toolkit',
              name: 'Test Toolkit',
            },
            is_disabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        next_cursor: null,
        total_pages: 1,
      });

      await expect(connectedAccounts.initiate(userId, authConfigId)).rejects.toThrow(
        ComposioMultipleConnectedAccountsError
      );
    });

    it('should allow multiple accounts when allowMultiple is true', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      // Mock list response to return multiple accounts
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [
          {
            id: 'conn_1',
            status: ConnectedAccountStatuses.ACTIVE,
            auth_config: {
              id: authConfigId,
              is_composio_managed: true,
              is_disabled: false,
            },
            data: {},
            params: {},
            status_reason: null,
            toolkit: {
              slug: 'test-toolkit',
              name: 'Test Toolkit',
            },
            is_disabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'conn_2',
            status: ConnectedAccountStatuses.ACTIVE,
            auth_config: {
              id: authConfigId,
              is_composio_managed: true,
              is_disabled: false,
            },
            data: {},
            params: {},
            status_reason: null,
            toolkit: {
              slug: 'test-toolkit',
              name: 'Test Toolkit',
            },
            is_disabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            authScheme: ConnectedAccountAuthSchemes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId, {
        allowMultiple: true,
      });

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: authConfigId,
        },
        connection: {
          user_id: userId,
          callback_url: undefined,
          state: undefined,
        },
      });

      expect(connectionRequest).toBeInstanceOf(ConnectionRequest);
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
          is_composio_managed: true,
          is_disabled: false,
        },
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
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

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.get(nanoid);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual({
        id: 'nanoid',
        status: 'ACTIVE',
        authConfig: {
          id: 'test-auth-config',
          isComposioManaged: true,
          isDisabled: false,
        },
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: 'ACTIVE',
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
        },
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
        status: ConnectedAccountStatuses.INITIALIZING,
        auth_scopes: ['read:user', 'write:user'],
        auth_config: {
          id: authConfigId,
          auth_scheme: ConnectedAccountAuthSchemes.OAUTH2,
          is_composio_managed: true,
          is_disabled: false,
        },
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.INITIALIZING,
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
      } as unknown as ConnectedAccountRetrieveResponse;

      const mockActiveResponse = {
        ...mockGetResponse,
        status: ConnectedAccountStatuses.ACTIVE,
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.ACTIVE,
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
        },
      } as unknown as ConnectedAccountRetrieveResponse;

      // Mock the get method first call
      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockGetResponse);
      // Mock the subsequent call in waitForConnection
      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockActiveResponse);

      const result = await connectedAccounts.waitForConnection(nanoid);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual({
        id: nanoid,
        status: ConnectedAccountStatuses.ACTIVE,
        authConfig: {
          id: 'auth_config_123',
          isComposioManaged: true,
          isDisabled: false,
        },
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.ACTIVE,
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
        },
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
        status: ConnectedAccountStatuses.INITIALIZING,
        auth_config: {
          id: 'auth_config_123',
          is_composio_managed: true,
          is_disabled: false,
        },
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.INITIALIZING,
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
        auth_scopes: ['read:user'],
        toolkit: {
          slug: 'test-toolkit',
        },
      } as unknown as ConnectedAccountRetrieveResponse;

      const mockActiveResponse = {
        ...mockGetResponse,
        status: 'ACTIVE',
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.ACTIVE,
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
        },
      } as unknown as ConnectedAccountRetrieveResponse;

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockGetResponse);
      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockActiveResponse);

      const result = await connectedAccounts.waitForConnection(nanoid, timeout);

      expect(extendedMockClient.connectedAccounts.retrieve).toHaveBeenCalledWith(nanoid);
      expect(result).toEqual({
        id: nanoid,
        status: ConnectedAccountStatuses.ACTIVE,
        authConfig: {
          id: 'auth_config_123',
          isComposioManaged: true,
          isDisabled: false,
        },
        state: {
          authScheme: ConnectedAccountAuthSchemes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.ACTIVE,
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
        },
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
});
