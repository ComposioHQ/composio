import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { ConnectedAccounts } from '../../src/models/ConnectedAccounts';
import { Experimental } from '../../src/models/Experimental';
import ComposioClient from '@composio/client';
import { ConnectedAccountRetrieveResponse } from '@composio/client/resources/connected-accounts.mjs';
import {
  ComposioAclOnlyForSharedError,
  ComposioConnectedAccountNotFoundError,
  ComposioFailedToCreateConnectedAccountLink,
} from '../../src/errors';
import { BadRequestError } from '@composio/client';
import { ConnectedAccountStatuses } from '../../src/types/connectedAccounts.types';
import { ComposioMultipleConnectedAccountsError } from '../../src/errors';
import { AuthSchemeTypes } from '../../src/types/authConfigs.types';
import { AuthScheme } from '../../src/models/AuthScheme';
import { ConnectionStatuses } from '../../src/types/connectedAccountAuthStates.types';

// Extend the mock client object for ConnectedAccounts testing
const extendedMockClient = {
  ...mockClient,
  connectedAccounts: {
    ...mockClient.connectedAccounts,
    create: vi.fn(),
    retrieve: vi.fn(),
    delete: vi.fn(),
    refresh: vi.fn(),
    patch: vi.fn(),
    updateStatus: vi.fn(),
    createConnectedAccountLink: vi.fn(),
  },
  link: {
    create: vi.fn(),
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
            authScheme: AuthSchemeTypes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId, options);

      // Verify list is called with ACTIVE status filter
      expect(extendedMockClient.connectedAccounts.list).toHaveBeenCalledWith(
        expect.objectContaining({
          user_ids: [userId],
          auth_config_ids: [authConfigId],
          statuses: [ConnectedAccountStatuses.ACTIVE],
        })
      );

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

      expect(connectionRequest).toHaveProperty('id', 'conn_123');
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
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
            authScheme: AuthSchemeTypes.OAUTH2,
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

      expect(connectionRequest).toHaveProperty('id', 'conn_123');
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should pass alias to the create API when provided', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            authScheme: AuthSchemeTypes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      await connectedAccounts.initiate(userId, authConfigId, {
        alias: 'work-gmail',
      });

      expect(extendedMockClient.connectedAccounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          auth_config: { id: authConfigId },
          connection: expect.objectContaining({ user_id: userId, alias: 'work-gmail' }),
        })
      );
    });

    it('should not include alias in create params when not provided', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            authScheme: AuthSchemeTypes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      await connectedAccounts.initiate(userId, authConfigId);

      const callArgs = extendedMockClient.connectedAccounts.create.mock.calls[0]![0];
      expect(callArgs.connection).not.toHaveProperty('alias');
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

    it('should filter by ACTIVE status when checking for existing accounts', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      // Mock list response to return empty list (no ACTIVE accounts)
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            authScheme: AuthSchemeTypes.OAUTH2,
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      await connectedAccounts.initiate(userId, authConfigId);

      // Verify that list is called with statuses filter set to ACTIVE only
      // This ensures expired/inactive accounts don't block new connection creation
      expect(extendedMockClient.connectedAccounts.list).toHaveBeenCalledWith(
        expect.objectContaining({
          user_ids: [userId],
          auth_config_ids: [authConfigId],
          statuses: [ConnectedAccountStatuses.ACTIVE],
        })
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
            authScheme: AuthSchemeTypes.OAUTH2,
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

      expect(connectionRequest).toHaveProperty('id', 'conn_123');
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should create a connected account with OAuth2 token import and return ACTIVE ConnectionRequest', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {
        callbackUrl: 'https://example.com/callback',
        config: AuthScheme.OAuth2({
          access_token: 'test_token',
          token_type: 'Bearer',
        }),
      };

      // Mock list response to return empty list
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // When tokens are imported, the API should return ACTIVE with no redirectUrl
      const mockResponse = {
        id: 'conn_123',
        connectionData: {
          val: {
            status: ConnectionStatuses.ACTIVE,
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
          state: options.config,
        },
      });

      expect(connectionRequest).toHaveProperty('id', 'conn_123');
      expect(connectionRequest).toHaveProperty('status', ConnectionStatuses.ACTIVE);
      expect(connectionRequest).toHaveProperty('redirectUrl', null);
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should return INITIATED status with redirectUrl when no tokens are provided', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const mockResponse = {
        id: 'conn_456',
        connectionData: {
          val: {
            status: ConnectionStatuses.INITIATED,
            redirectUrl: 'https://auth.example.com/connect',
          },
        },
      };

      extendedMockClient.connectedAccounts.create.mockResolvedValueOnce(mockResponse);

      const connectionRequest = await connectedAccounts.initiate(userId, authConfigId);

      expect(connectionRequest).toHaveProperty('id', 'conn_456');
      expect(connectionRequest).toHaveProperty('status', ConnectionStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty('redirectUrl', 'https://auth.example.com/connect');
    });
  });

  // SEC-339: initiate() must gate its deprecation warning on the response
  // `Deprecation` HTTP header (RFC 9745) that apollo emits only on the
  // retiring branch (Composio-managed + redirectable OAuth). These tests pin
  // that contract so the previous false-positive behavior — warning purely
  // off auth_scheme, which over-fired for custom auth configs — can't come
  // back. See https://docs.composio.dev/docs/changelog/2026/04/24
  describe('initiate deprecation header gate', () => {
    /** Wrap a value as an APIPromise-shaped thenable that also exposes
     * `.withResponse()` returning the value plus a synthesised Response
     * carrying the given headers. Mirrors the @composio/client APIPromise
     * surface that the SDK now consumes for header-aware deprecation. */
    function mockApiPromiseWithHeaders<T>(
      data: T,
      headers: Record<string, string> = {}
    ): Promise<T> & {
      withResponse: () => Promise<{ data: T; response: Response }>;
    } {
      const response = new Response(null, { headers: new Headers(headers) });
      const promise = Promise.resolve(data) as Promise<T> & {
        withResponse: () => Promise<{ data: T; response: Response }>;
      };
      promise.withResponse = () => Promise.resolve({ data, response });
      return promise;
    }

    const userId = 'user_dep';
    const authConfigId = 'auth_config_dep';
    const baseResponse = {
      id: 'conn_dep',
      connectionData: {
        val: {
          authScheme: AuthSchemeTypes.OAUTH2,
          status: 'INITIALIZING',
          redirectUrl: 'https://auth.example.com/connect',
        },
      },
    };

    /** Re-import the model with a fresh module-level
     * `_legacyInitiateWarningEmitted` so each test starts unwarned. */
    async function freshConnectedAccounts() {
      vi.resetModules();
      const { ConnectedAccounts: Fresh } = await import('../../src/models/ConnectedAccounts');
      const fresh = new Fresh(extendedMockClient as unknown as ComposioClient);
      const loggerMod = await import('../../src/utils/logger');
      const warnSpy = vi.spyOn(loggerMod.default, 'warn').mockImplementation(() => {});
      return { connectedAccounts: fresh, warnSpy };
    }

    it('warns once when response carries a Deprecation header (managed + OAuth retiring path)', async () => {
      const { connectedAccounts: fresh, warnSpy } = await freshConnectedAccounts();
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });
      extendedMockClient.connectedAccounts.create.mockReturnValueOnce(
        mockApiPromiseWithHeaders(baseResponse, {
          Deprecation: '@1776988800',
          Sunset: 'Fri, 08 May 2026 00:00:00 GMT',
          Link: '<https://docs.composio.dev/docs/changelog/2026/04/24>; rel="deprecation"',
        })
      );

      const req = await fresh.initiate(userId, authConfigId);

      expect(req).toHaveProperty('id', 'conn_dep');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toMatch(/composio\.connectedAccounts\.link\(\)/);
      expect(warnSpy.mock.calls[0]![0]).toMatch(/2026-07-03/);
    });

    it('does NOT warn when response has no Deprecation header (custom auth config)', async () => {
      // Regression test: prior auth_scheme-only check warned for any
      // OAUTH2 response, including custom configs that are not subject
      // to the cutover. Header absence is the canonical "you're fine"
      // signal from apollo.
      const { connectedAccounts: fresh, warnSpy } = await freshConnectedAccounts();
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });
      extendedMockClient.connectedAccounts.create.mockReturnValueOnce(
        mockApiPromiseWithHeaders(baseResponse /* no Deprecation header */)
      );

      const req = await fresh.initiate(userId, authConfigId);

      expect(req).toHaveProperty('id', 'conn_dep');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns at most once per process even across multiple managed-OAuth calls', async () => {
      const { connectedAccounts: fresh, warnSpy } = await freshConnectedAccounts();
      // Two consecutive managed-OAuth calls. Both responses carry the
      // Deprecation header, but the module-level guard should let only
      // the first one through.
      for (let i = 0; i < 2; i++) {
        extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
          items: [],
          next_cursor: null,
          total_pages: 1,
        });
        extendedMockClient.connectedAccounts.create.mockReturnValueOnce(
          mockApiPromiseWithHeaders(baseResponse, { Deprecation: '@1776988800' })
        );
        await fresh.initiate(userId, authConfigId);
      }

      expect(warnSpy).toHaveBeenCalledTimes(1);
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
        wordId: null,
        alias: null,
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
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

    it('should preserve alias and wordId when the API returns them', async () => {
      const nanoid = 'conn_456';
      const mockResponse = {
        id: nanoid,
        status: 'ACTIVE',
        word_id: 'castle',
        alias: 'Work Gmail',
        auth_config: {
          id: 'test-auth-config',
          is_composio_managed: true,
          is_disabled: false,
        },
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: null,
        toolkit: {
          slug: 'gmail',
        },
      };

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.get(nanoid);

      expect(result.wordId).toBe('castle');
      expect(result.alias).toBe('Work Gmail');
    });

    it('should accept revoked connected account status from the generated client', async () => {
      const nanoid = 'conn_revoked';
      const mockResponse = {
        id: nanoid,
        status: ConnectedAccountStatuses.REVOKED,
        auth_config: {
          id: 'test-auth-config',
          is_composio_managed: true,
          is_disabled: false,
        },
        is_disabled: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        status_reason: 'revoked by user',
        toolkit: {
          slug: 'gmail',
        },
      };

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.get(nanoid);

      expect(result.status).toBe(ConnectedAccountStatuses.REVOKED);
      expect(result.statusReason).toBe('revoked by user');
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
    it('should refresh a connected account by nanoid without options', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, refreshed: true };

      extendedMockClient.connectedAccounts.refresh.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.refresh(nanoid);

      expect(extendedMockClient.connectedAccounts.refresh).toHaveBeenCalledWith(nanoid, undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should refresh a connected account with redirectUrl option', async () => {
      const nanoid = 'conn_123';
      const redirectUrl = 'https://example.com/oauth/callback';
      const mockResponse = { id: nanoid, refreshed: true };

      extendedMockClient.connectedAccounts.refresh.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.refresh(nanoid, { redirectUrl });

      expect(extendedMockClient.connectedAccounts.refresh).toHaveBeenCalledWith(nanoid, {
        query_redirect_url: redirectUrl,
        validate_credentials: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should refresh a connected account with validateCredentials option', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, refreshed: true };

      extendedMockClient.connectedAccounts.refresh.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.refresh(nanoid, { validateCredentials: true });

      expect(extendedMockClient.connectedAccounts.refresh).toHaveBeenCalledWith(nanoid, {
        query_redirect_url: undefined,
        validate_credentials: true,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should refresh a connected account with both options', async () => {
      const nanoid = 'conn_123';
      const options = {
        redirectUrl: 'https://example.com/callback',
        validateCredentials: false,
      };
      const mockResponse = { id: nanoid, refreshed: true };

      extendedMockClient.connectedAccounts.refresh.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.refresh(nanoid, options);

      expect(extendedMockClient.connectedAccounts.refresh).toHaveBeenCalledWith(nanoid, {
        query_redirect_url: options.redirectUrl,
        validate_credentials: options.validateCredentials,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw ValidationError for invalid options', async () => {
      const nanoid = 'conn_123';
      const invalidOptions = { redirectUrl: 123 };

      await expect(connectedAccounts.refresh(nanoid, invalidOptions as any)).rejects.toThrow(
        'Failed to parse connected account refresh options'
      );

      expect(extendedMockClient.connectedAccounts.refresh).not.toHaveBeenCalled();
    });

    it('should handle empty options object gracefully', async () => {
      const nanoid = 'conn_123';
      const mockResponse = { id: nanoid, refreshed: true };

      extendedMockClient.connectedAccounts.refresh.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.refresh(nanoid, {});

      expect(extendedMockClient.connectedAccounts.refresh).toHaveBeenCalledWith(nanoid, {
        query_redirect_url: undefined,
        validate_credentials: undefined,
      });
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
          auth_scheme: AuthSchemeTypes.OAUTH2,
          is_composio_managed: true,
          is_disabled: false,
        },
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
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
          authScheme: AuthSchemeTypes.OAUTH2,
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
        alias: null,
        authConfig: {
          id: 'auth_config_123',
          authScheme: AuthSchemeTypes.OAUTH2,
          isComposioManaged: true,
          isDisabled: false,
        },
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
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
        wordId: null,
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
          authScheme: AuthSchemeTypes.OAUTH2,
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
          authScheme: AuthSchemeTypes.OAUTH2,
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
        alias: null,
        authConfig: {
          id: 'auth_config_123',
          authScheme: undefined,
          isComposioManaged: true,
          isDisabled: false,
        },
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
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
        wordId: null,
      });
    });
  });

  describe('update', () => {
    it('should enable a connected account', async () => {
      const nanoid = 'conn_abc123';
      const mockResponse = { success: true, id: nanoid, status: 'ACTIVE' };

      extendedMockClient.connectedAccounts.updateStatus.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.update(nanoid, { enabled: true });

      expect(extendedMockClient.connectedAccounts.updateStatus).toHaveBeenCalledWith(nanoid, {
        enabled: true,
      });
      expect(result).toEqual({ success: true, id: nanoid, status: 'ACTIVE' });
    });

    it('should disable a connected account', async () => {
      const nanoid = 'conn_abc123';
      const mockResponse = { success: true };

      extendedMockClient.connectedAccounts.updateStatus.mockResolvedValueOnce(mockResponse);

      const result = await connectedAccounts.update(nanoid, { enabled: false });

      expect(extendedMockClient.connectedAccounts.updateStatus).toHaveBeenCalledWith(nanoid, {
        enabled: false,
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw ValidationError for invalid params', async () => {
      await expect(
        connectedAccounts.update('conn_abc123', { enabled: 'yes' } as any)
      ).rejects.toThrow('Failed to parse connected account update params');
    });
  });

  describe('link', () => {
    beforeEach(() => {
      // link() now mirrors initiate() and pre-flights connectedAccounts.list to
      // enforce the allowMultiple guard. Default to no existing connections so
      // existing tests don't need to mock the list call themselves.
      extendedMockClient.connectedAccounts.list.mockResolvedValue({
        items: [],
        next_cursor: null,
        total_pages: 0,
      });
    });

    it('should create a connected account link without options and return a ConnectionRequest', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      // Mock the API response for client.link.create
      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      const connectionRequest = await connectedAccounts.link(userId, authConfigId);

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
      });

      expect(connectionRequest).toHaveProperty('id', 'conn_456def');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty(
        'redirectUrl',
        'https://connect.composio.dev/auth?token=abc123'
      );
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should create a connected account link with callback URL and return a ConnectionRequest', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {
        callbackUrl: 'https://example.com/callback',
      };

      // Mock the API response for client.link.create
      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url:
          'https://connect.composio.dev/auth?token=abc123&callback_url=https://example.com/callback',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      const connectionRequest = await connectedAccounts.link(userId, authConfigId, options);

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
        callback_url: options.callbackUrl,
      });

      expect(connectionRequest).toHaveProperty('id', 'conn_456def');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty(
        'redirectUrl',
        'https://connect.composio.dev/auth?token=abc123&callback_url=https://example.com/callback'
      );
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should validate options parameter and throw ValidationError for invalid options', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const invalidOptions = {
        callbackUrl: 123, // Invalid type - should be string
      };

      await expect(
        connectedAccounts.link(userId, authConfigId, invalidOptions as any)
      ).rejects.toThrow('Failed to parse create connected account link options');

      // Ensure API was not called with invalid options
      expect(extendedMockClient.link.create).not.toHaveBeenCalled();
    });

    it('should handle undefined options gracefully', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      const connectionRequest = await connectedAccounts.link(userId, authConfigId, undefined);

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
      });

      expect(connectionRequest).toHaveProperty('id', 'conn_456def');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty(
        'redirectUrl',
        'https://connect.composio.dev/auth?token=abc123'
      );
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should handle empty options object gracefully', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {};

      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      const connectionRequest = await connectedAccounts.link(userId, authConfigId, options);

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
      });

      expect(connectionRequest).toHaveProperty('id', 'conn_456def');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty(
        'redirectUrl',
        'https://connect.composio.dev/auth?token=abc123'
      );
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });

    it('should return a ConnectionRequest with the expected structure', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {
        callbackUrl: 'https://example.com/callback',
      };

      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      const connectionRequest = await connectedAccounts.link(userId, authConfigId, options);

      // Test the structure of the returned ConnectionRequest
      expect(connectionRequest).toHaveProperty('id', 'conn_456def');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty(
        'redirectUrl',
        'https://connect.composio.dev/auth?token=abc123'
      );
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(connectionRequest).toHaveProperty('toJSON');
      expect(connectionRequest).toHaveProperty('toString');

      // Test that methods are functions
      expect(typeof connectionRequest.waitForConnection).toBe('function');
      expect(typeof connectionRequest.toJSON).toBe('function');
      expect(typeof connectionRequest.toString).toBe('function');

      // Test serialization methods
      const jsonObj = connectionRequest.toJSON();
      expect(jsonObj).toHaveProperty('id', connectionRequest.id);
      expect(jsonObj).toHaveProperty('status', connectionRequest.status);
      expect(jsonObj).toHaveProperty('redirectUrl', connectionRequest.redirectUrl);

      const jsonString = connectionRequest.toString();
      expect(typeof jsonString).toBe('string');
      const parsedObj = JSON.parse(jsonString);
      expect(parsedObj).toEqual(jsonObj);
    });

    it('should handle various callback URL formats', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      const testCases = [
        'https://example.com/callback',
        'http://localhost:3000/auth/callback',
        'https://app.example.com/integration/composio/callback?state=xyz',
        'https://subdomain.example.com:8080/callback',
      ];

      for (const callbackUrl of testCases) {
        const mockLinkResponse = {
          connected_account_id: 'conn_456def',
          redirect_url: 'https://connect.composio.dev/auth?token=abc123',
        };

        extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

        const options = { callbackUrl };
        const connectionRequest = await connectedAccounts.link(userId, authConfigId, options);

        expect(extendedMockClient.link.create).toHaveBeenCalledWith({
          auth_config_id: authConfigId,
          user_id: userId,
          callback_url: callbackUrl,
        });

        expect(connectionRequest).toHaveProperty('id', 'conn_456def');
        expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
        expect(connectionRequest).toHaveProperty('waitForConnection');
        expect(typeof connectionRequest.waitForConnection).toBe('function');
      }
    });

    it('should create a connection request that can wait for completion', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      const connectionRequest = await connectedAccounts.link(userId, authConfigId);

      // Mock the retrieve method to simulate connection completion
      const mockActiveResponse = {
        id: 'conn_456def',
        status: ConnectedAccountStatuses.ACTIVE,
        auth_config: {
          id: authConfigId,
          is_composio_managed: true,
          is_disabled: false,
        },
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
          val: {
            status: ConnectedAccountStatuses.ACTIVE,
            access_token: 'access_token_123',
            token_type: 'Bearer',
          },
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
      };

      extendedMockClient.connectedAccounts.retrieve.mockResolvedValueOnce(mockActiveResponse);

      const result = await connectionRequest.waitForConnection();

      expect(result).toHaveProperty('id', 'conn_456def');
      expect(result).toHaveProperty('status', ConnectedAccountStatuses.ACTIVE);
    });

    it('should throw ComposioFailedToCreateConnectedAccountLink when API call fails', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const apiError = new Error('API Error: Network failure');

      extendedMockClient.link.create.mockRejectedValueOnce(apiError);

      await expect(connectedAccounts.link(userId, authConfigId)).rejects.toThrow(
        ComposioFailedToCreateConnectedAccountLink
      );

      await expect(connectedAccounts.link(userId, authConfigId)).rejects.toThrow(
        'Failed to create connected account link'
      );

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
      });
    });

    it('should not include callback_url in API call when callbackUrl is not provided', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {}; // Empty options, no callbackUrl

      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      await connectedAccounts.link(userId, authConfigId, options);

      // Verify that callback_url is not included in the API call
      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
      });

      // Ensure callback_url key is not present at all
      const callArgs = extendedMockClient.link.create.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('callback_url');
    });

    it('should include callback_url in API call only when callbackUrl is provided', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';
      const options = {
        callbackUrl: 'https://example.com/callback',
      };

      const mockLinkResponse = {
        connected_account_id: 'conn_456def',
        redirect_url: 'https://connect.composio.dev/auth?token=abc123',
      };

      extendedMockClient.link.create.mockResolvedValueOnce(mockLinkResponse);

      await connectedAccounts.link(userId, authConfigId, options);

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
        callback_url: 'https://example.com/callback',
      });
    });

    it('throws ComposioMultipleConnectedAccountsError when an active connection exists and allowMultiple is false', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      extendedMockClient.connectedAccounts.list.mockReset();
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [
          {
            id: 'conn_existing',
            status: ConnectedAccountStatuses.ACTIVE,
            auth_config: { id: authConfigId, auth_scheme: 'OAUTH2', is_composio_managed: true },
            toolkit: { slug: 'gmail' },
          },
        ],
        next_cursor: null,
        total_pages: 1,
      });

      await expect(connectedAccounts.link(userId, authConfigId)).rejects.toThrow(
        ComposioMultipleConnectedAccountsError
      );

      expect(extendedMockClient.link.create).not.toHaveBeenCalled();
    });

    it('skips the guard when allowMultiple is true and proceeds with link.create', async () => {
      const userId = 'user_123';
      const authConfigId = 'auth_config_123';

      extendedMockClient.connectedAccounts.list.mockReset();
      extendedMockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [
          {
            id: 'conn_existing',
            status: ConnectedAccountStatuses.ACTIVE,
            auth_config: { id: authConfigId, auth_scheme: 'OAUTH2', is_composio_managed: true },
            toolkit: { slug: 'gmail' },
          },
        ],
        next_cursor: null,
        total_pages: 1,
      });
      extendedMockClient.link.create.mockResolvedValueOnce({
        connected_account_id: 'conn_new',
        redirect_url: 'https://connect.composio.dev/auth?token=xyz',
      });

      const connectionRequest = await connectedAccounts.link(userId, authConfigId, {
        allowMultiple: true,
        alias: 'work-gmail',
      });

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: authConfigId,
        user_id: userId,
        alias: 'work-gmail',
      });
      expect(connectionRequest).toHaveProperty('id', 'conn_new');
    });
  });

  describe('link with experimental block (SHARED + ACL)', () => {
    beforeEach(() => {
      extendedMockClient.connectedAccounts.list.mockResolvedValue({
        items: [],
        next_cursor: null,
        total_pages: 0,
      });
      extendedMockClient.link.create.mockResolvedValue({
        connected_account_id: 'conn_shared_abc',
        redirect_url: 'https://connect.composio.dev/auth?token=xyz',
      });
    });

    it('forwards experimental block with accountType + aclConfigForShared to client.link.create', async () => {
      await connectedAccounts.link('user_123', 'auth_config_123', {
        experimental: {
          accountType: 'SHARED',
          aclConfigForShared: {
            allowAllUsers: true,
            notAllowedUserIds: ['user_bob'],
          },
        },
      });

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: 'auth_config_123',
        user_id: 'user_123',
        experimental: {
          account_type: 'SHARED',
          acl_config_for_shared: {
            allow_all_users: true,
            not_allowed_user_ids: ['user_bob'],
          },
        },
      });
    });

    it('omits the inner acl block when aclConfigForShared is undefined', async () => {
      await connectedAccounts.link('user_123', 'auth_config_123', {
        experimental: { accountType: 'SHARED' },
      });

      const body = extendedMockClient.link.create.mock.calls[0][0];
      expect(body.experimental).toEqual({ account_type: 'SHARED' });
      expect('acl_config_for_shared' in body.experimental).toBe(false);
    });

    it('omits the experimental block entirely when not provided', async () => {
      await connectedAccounts.link('user_123', 'auth_config_123');

      const body = extendedMockClient.link.create.mock.calls[0][0];
      expect('experimental' in body).toBe(false);
    });

    it('serializes only the inner ACL fields the caller provided', async () => {
      await connectedAccounts.link('user_123', 'auth_config_123', {
        experimental: {
          accountType: 'SHARED',
          aclConfigForShared: { allowedUserIds: ['user_alice'] },
        },
      });

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: 'auth_config_123',
        user_id: 'user_123',
        experimental: {
          account_type: 'SHARED',
          acl_config_for_shared: { allowed_user_ids: ['user_alice'] },
        },
      });
    });

    it('preserves explicit empty arrays in the serialized body', async () => {
      await connectedAccounts.link('user_123', 'auth_config_123', {
        experimental: {
          accountType: 'SHARED',
          aclConfigForShared: { allowedUserIds: [], notAllowedUserIds: [] },
        },
      });

      expect(extendedMockClient.link.create).toHaveBeenCalledWith({
        auth_config_id: 'auth_config_123',
        user_id: 'user_123',
        experimental: {
          account_type: 'SHARED',
          acl_config_for_shared: {
            allowed_user_ids: [],
            not_allowed_user_ids: [],
          },
        },
      });
    });

    it('maps 400 AclOnlyForShared to ComposioAclOnlyForSharedError', async () => {
      extendedMockClient.link.create.mockReset();
      extendedMockClient.link.create.mockRejectedValueOnce(
        Object.assign(
          new BadRequestError(
            400,
            undefined,
            'acl_config_for_shared is only valid on SHARED connections.',
            {}
          ),
          {}
        )
      );

      await expect(
        connectedAccounts.link('user_123', 'auth_config_123', {
          experimental: {
            accountType: 'PRIVATE',
            aclConfigForShared: { allowAllUsers: true },
          },
        })
      ).rejects.toBeInstanceOf(ComposioAclOnlyForSharedError);
    });

    it('falls back to ComposioFailedToCreateConnectedAccountLink on unrelated errors', async () => {
      extendedMockClient.link.create.mockReset();
      extendedMockClient.link.create.mockRejectedValueOnce(new Error('network died'));

      await expect(connectedAccounts.link('user_123', 'auth_config_123')).rejects.toBeInstanceOf(
        ComposioFailedToCreateConnectedAccountLink
      );
    });
  });

  describe('list with accountType filter', () => {
    it('forwards accountType to the wire as a flat query param', async () => {
      extendedMockClient.connectedAccounts.list.mockResolvedValue({
        items: [],
        next_cursor: null,
        total_pages: 0,
      });

      await connectedAccounts.list({ accountType: 'SHARED', userIds: ['user_creator'] });

      const callArg = extendedMockClient.connectedAccounts.list.mock.calls[0][0];
      expect(callArg.account_type).toBe('SHARED');
      expect(callArg.user_ids).toEqual(['user_creator']);
    });

    it('omits account_type when accountType is not provided', async () => {
      extendedMockClient.connectedAccounts.list.mockResolvedValue({
        items: [],
        next_cursor: null,
        total_pages: 0,
      });

      await connectedAccounts.list({ userIds: ['user_creator'] });

      const callArg = extendedMockClient.connectedAccounts.list.mock.calls[0][0];
      expect('account_type' in callArg).toBe(false);
    });
  });

  describe('composio.experimental.updateAcl', () => {
    let experimental: Experimental;

    beforeEach(() => {
      experimental = new Experimental(extendedMockClient as unknown as ComposioClient);
    });

    it('serializes PATCH body under experimental.acl_config_for_shared', async () => {
      extendedMockClient.connectedAccounts.patch.mockResolvedValueOnce({
        id: 'ca_abc',
        status: 'ACTIVE',
        success: true,
      });

      const result = await experimental.updateAcl('ca_abc', {
        allowAllUsers: true,
        notAllowedUserIds: ['user_bob'],
      });

      expect(extendedMockClient.connectedAccounts.patch).toHaveBeenCalledWith('ca_abc', {
        experimental: {
          acl_config_for_shared: {
            allow_all_users: true,
            not_allowed_user_ids: ['user_bob'],
          },
        },
      });
      expect(result).toEqual({ id: 'ca_abc', status: 'ACTIVE', success: true });
    });

    it('omits absent fields from the inner block (PATCH semantics)', async () => {
      extendedMockClient.connectedAccounts.patch.mockResolvedValueOnce({
        id: 'ca_abc',
        status: 'ACTIVE',
        success: true,
      });

      await experimental.updateAcl('ca_abc', { allowedUserIds: ['user_alice'] });

      expect(extendedMockClient.connectedAccounts.patch).toHaveBeenCalledWith('ca_abc', {
        experimental: {
          acl_config_for_shared: { allowed_user_ids: ['user_alice'] },
        },
      });
    });

    it('preserves empty array to clear a list', async () => {
      extendedMockClient.connectedAccounts.patch.mockResolvedValueOnce({
        id: 'ca_abc',
        status: 'ACTIVE',
        success: true,
      });

      await experimental.updateAcl('ca_abc', { allowedUserIds: [] });

      expect(extendedMockClient.connectedAccounts.patch).toHaveBeenCalledWith('ca_abc', {
        experimental: { acl_config_for_shared: { allowed_user_ids: [] } },
      });
    });

    it('rejects an empty params object via the refine', async () => {
      await expect(experimental.updateAcl('ca_abc', {})).rejects.toMatchObject({
        name: 'ValidationError',
      });
      expect(extendedMockClient.connectedAccounts.patch).not.toHaveBeenCalled();
    });

    it('maps 400 AclOnlyForShared to ComposioAclOnlyForSharedError', async () => {
      extendedMockClient.connectedAccounts.patch.mockRejectedValueOnce(
        new BadRequestError(
          400,
          undefined,
          'acl_config_for_shared is only valid on SHARED connections.',
          {}
        )
      );

      await expect(
        experimental.updateAcl('ca_abc', { allowAllUsers: true })
      ).rejects.toBeInstanceOf(ComposioAclOnlyForSharedError);
    });

    it('rethrows non-AclOnlyForShared errors unchanged', async () => {
      const otherError = new Error('connection lost');
      extendedMockClient.connectedAccounts.patch.mockRejectedValueOnce(otherError);

      await expect(experimental.updateAcl('ca_abc', { allowAllUsers: true })).rejects.toBe(
        otherError
      );
    });
  });
});
