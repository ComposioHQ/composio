import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Toolkits } from '../../src/models/toolkits';
import ComposioClient from '@composio/client';
import { ValidationError } from '../../src/errors/ValidationErrors';
import { ComposioToolkitFetchError, ComposioToolkitNotFoundError } from '../../src/errors';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ConnectionRequest } from '../../src/models/ConnectionRequest';
import { ComposioAuthConfigNotFoundError } from '../../src/errors/AuthConfigErrors';

// Mock dependencies
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

// Create mock client with toolkit-related methods
const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  toolkits: {
    list: vi.fn(),
    retrieve: vi.fn(),
    retrieveCategories: vi.fn(),
    listCategories: vi.fn(),
    authorize: vi.fn(),
  },
  authConfigs: {
    list: vi.fn(),
    create: vi.fn(),
  },
  connectedAccounts: {
    initiate: vi.fn(),
    create: vi.fn(),
  },
});

// Mock response data
const mockToolkitListResponse = {
  items: [
    {
      name: 'GitHub',
      slug: 'github',
      meta: {
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        tools_count: 10,
        triggers_count: 5,
      },
      is_local_toolkit: false,
      auth_schemes: ['oauth2'],
      composio_managed_auth_schemes: ['oauth2'],
      no_auth: false,
    },
  ],
};

const mockToolkitRetrieveResponse = {
  name: 'GitHub',
  slug: 'github',
  meta: {
    created_at: '2024-01-01',
    updated_at: '2024-01-02',
    tools_count: 10,
    triggers_count: 5,
  },
  is_local_toolkit: false,
  composio_managed_auth_schemes: ['oauth2'],
  auth_config_details: [
    {
      name: 'oauth2',
      mode: 'oauth2',
      fields: {
        auth_config_creation: {
          optional: [],
          required: [],
        },
        connected_account_initiation: {
          optional: [],
          required: [],
        },
      },
      proxy: {
        base_url: 'https://api.github.com',
      },
    },
  ],
};

describe('Toolkits', () => {
  let toolkits: Toolkits;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    toolkits = new Toolkits(mockClient as unknown as ComposioClient);
  });

  describe('constructor', () => {
    it('should create an instance successfully', () => {
      expect(toolkits).toBeInstanceOf(Toolkits);
      expect(telemetry.instrument).toHaveBeenCalledWith(toolkits);
    });

    it('should store the client reference', () => {
      expect(toolkits['client']).toBe(mockClient);
    });
  });

  describe('get', () => {
    it('should get a list of toolkits', async () => {
      mockClient.toolkits.list.mockResolvedValue(mockToolkitListResponse);

      const result = await toolkits.get({});

      expect(result).toEqual([
        {
          name: 'GitHub',
          slug: 'github',
          meta: {
            createdAt: '2024-01-01',
            updatedAt: '2024-01-02',
            toolsCount: 10,
            triggersCount: 5,
          },
          isLocalToolkit: false,
          authSchemes: ['oauth2'],
          composioManagedAuthSchemes: ['oauth2'],
          noAuth: false,
        },
      ]);
      expect(mockClient.toolkits.list).toHaveBeenCalledWith({});
    });

    it('should get a single toolkit by slug', async () => {
      mockClient.toolkits.retrieve.mockResolvedValue(mockToolkitRetrieveResponse);

      const result = await toolkits.get('github');

      expect(result).toEqual({
        name: 'GitHub',
        slug: 'github',
        meta: {
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          toolsCount: 10,
          triggersCount: 5,
        },
        isLocalToolkit: false,
        composioManagedAuthSchemes: ['oauth2'],
        authConfigDetails: [
          {
            name: 'oauth2',
            mode: 'oauth2',
            fields: {
              authConfigCreation: {
                optional: [],
                required: [],
              },
              connectedAccountInitiation: {
                optional: [],
                required: [],
              },
            },
            proxy: {
              baseUrl: 'https://api.github.com',
            },
          },
        ],
      });
      expect(mockClient.toolkits.retrieve).toHaveBeenCalledWith('github');
    });

    it('should throw ValidationError for invalid list query', async () => {
      const promise = toolkits.get({ category: 123 } as any);
      await expect(promise).rejects.toThrowError('Failed to fetch toolkits');
    });

    it('should throw ComposioToolkitNotFoundError when toolkit not found', async () => {
      mockClient.toolkits.retrieve.mockRejectedValue(
        new Error('Toolkit with slug non-existent not found')
      );

      const promise = toolkits.get('non-existent');
      await expect(promise).rejects.toThrowError("Couldn't fetch Toolkit with slug: non-existent");
    });

    it('should throw ComposioToolkitFetchError for other errors', async () => {
      mockClient.toolkits.list.mockRejectedValue(new Error('Network error'));

      const promise = toolkits.get({});
      await expect(promise).rejects.toThrowError('Failed to fetch toolkits');
    });
  });

  describe('listCategories', () => {
    it('should list toolkit categories', async () => {
      const mockResponse = {
        items: [
          {
            id: 'cat-1',
            name: 'Category 1',
          },
        ],
        next_cursor: null,
        total_pages: 1,
      };

      mockClient.toolkits.retrieveCategories.mockResolvedValue(mockResponse);

      const result = await toolkits.listCategories();

      expect(result).toEqual({
        items: mockResponse.items,
        nextCursor: mockResponse.next_cursor,
        totalPages: mockResponse.total_pages,
      });
    });
  });

  describe('authorize', () => {
    it('should create auth config and initiate connection request when no auth config exists', async () => {
      // Mock toolkit retrieval
      mockClient.toolkits.retrieve.mockResolvedValue({
        name: 'Test Toolkit',
        slug: 'test-toolkit',
        meta: {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tools_count: 1,
          triggers_count: 0,
        },
        is_local_toolkit: false,
        auth_config_details: [
          {
            name: 'OAuth2',
            mode: 'OAUTH2',
            fields: {
              auth_config_creation: {
                optional: [],
                required: [],
              },
              connected_account_initiation: {
                optional: [],
                required: [],
              },
            },
          },
        ],
      });

      // Mock empty auth config list
      mockClient.authConfigs.list.mockResolvedValue({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock auth config creation
      mockClient.authConfigs.create.mockResolvedValue({
        auth_config: {
          id: 'new-auth-config-id',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          toolkit: {
            slug: 'test-toolkit',
            logo: 'https://example.com/logo.png',
          },
        },
        toolkit: {
          slug: 'test-toolkit',
        },
      });

      // Mock connection request initiation
      mockClient.connectedAccounts.create.mockResolvedValue({
        id: 'connection-request-id',
        connectionData: {
          val: {
            status: 'INITIATED',
            redirectUrl: 'https://auth.url',
          },
        },
      });

      const result = await toolkits.authorize('user-123', 'test-toolkit');

      expect(mockClient.authConfigs.create).toHaveBeenCalledWith({
        toolkit: {
          slug: 'test-toolkit',
        },
        auth_config: {
          type: 'use_composio_managed_auth',
          name: 'Test Toolkit Auth Config',
        },
      });

      expect(mockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: 'new-auth-config-id',
        },
        connection: {
          user_id: 'user-123',
        },
      });

      expect(result.toJSON()).toEqual({
        id: 'connection-request-id',
        status: 'INITIATED',
        redirectUrl: 'https://auth.url',
      });
    });

    it('should use existing auth config to initiate connection request', async () => {
      // Mock toolkit retrieval
      mockClient.toolkits.retrieve.mockResolvedValue({
        name: 'Test Toolkit',
        slug: 'test-toolkit',
        meta: {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tools_count: 1,
          triggers_count: 0,
        },
        is_local_toolkit: false,
        auth_config_details: [
          {
            name: 'OAuth2',
            mode: 'OAUTH2',
            fields: {
              auth_config_creation: {
                optional: [],
                required: [],
              },
              connected_account_initiation: {
                optional: [],
                required: [],
              },
            },
          },
        ],
      });

      // Mock existing auth config
      mockClient.authConfigs.list.mockResolvedValue({
        items: [
          {
            id: 'existing-auth-config-id',
            auth_scheme: 'OAUTH2',
            is_composio_managed: true,
            name: 'Existing Auth Config',
            no_of_connections: 0,
            status: 'ENABLED',
            toolkit: {
              logo: 'https://example.com/logo.png',
              slug: 'test-toolkit',
            },
            uuid: 'uuid-1',
            credentials: {},
            expected_input_fields: [],
            created_by: 'user-1',
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          },
        ],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock connection request initiation
      mockClient.connectedAccounts.create.mockResolvedValue({
        id: 'connection-request-id',
        connectionData: {
          val: {
            status: 'INITIATED',
            redirectUrl: 'https://auth.url',
          },
        },
      });

      const result = await toolkits.authorize('user-123', 'test-toolkit');

      expect(mockClient.authConfigs.create).not.toHaveBeenCalled();
      expect(mockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: 'existing-auth-config-id',
        },
        connection: {
          user_id: 'user-123',
        },
      });

      expect(result.toJSON()).toEqual({
        id: 'connection-request-id',
        status: 'INITIATED',
        redirectUrl: 'https://auth.url',
      });
    });

    it('should throw ComposioAuthConfigNotFoundError when toolkit has no auth config details', async () => {
      // Mock toolkit retrieval with no auth config details
      mockClient.toolkits.retrieve.mockResolvedValue({
        name: 'Test Toolkit',
        slug: 'test-toolkit',
        meta: {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tools_count: 1,
          triggers_count: 0,
        },
        is_local_toolkit: false,
        auth_config_details: [],
      });

      // Mock empty auth config list
      mockClient.authConfigs.list.mockResolvedValue({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock the error to be thrown
      mockClient.authConfigs.create.mockRejectedValue(
        new ComposioAuthConfigNotFoundError('No auth config found for toolkit')
      );

      const promise = toolkits.authorize('user-123', 'test-toolkit');

      await expect(promise).rejects.toThrow(ComposioAuthConfigNotFoundError);
      await expect(promise).rejects.toThrow('No auth config found for toolkit');
      expect(mockClient.authConfigs.create).not.toHaveBeenCalled();
      expect(mockClient.connectedAccounts.initiate).not.toHaveBeenCalled();
    });

    it('should throw ComposioToolkitNotFoundError when toolkit does not exist', async () => {
      mockClient.toolkits.retrieve.mockRejectedValue(
        new Error('Toolkit with slug non-existent not found')
      );

      const promise = toolkits.authorize('user-123', 'non-existent');

      await expect(promise).rejects.toThrow("Couldn't fetch Toolkit with slug: non-existent");
      expect(mockClient.authConfigs.list).not.toHaveBeenCalled();
      expect(mockClient.authConfigs.create).not.toHaveBeenCalled();
      expect(mockClient.connectedAccounts.initiate).not.toHaveBeenCalled();
    });
  });
});
