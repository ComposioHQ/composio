import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Toolkits } from '../../src/models/Toolkits';
import ComposioClient from '@composio/client';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ComposioAuthConfigNotFoundError } from '../../src/errors/AuthConfigErrors';
import { AuthSchemeTypes } from '../../src/types/authConfigs.types';
import { APIError } from '@composio/client';

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
    get: vi.fn(),
  },
  authConfigs: {
    list: vi.fn(),
    create: vi.fn(),
  },
  connectedAccounts: {
    initiate: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
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
    const userId = 'user_123';
    const toolkitSlug = 'test-toolkit';
    const mockToolkitResponse = {
      slug: toolkitSlug,
      name: 'Test Toolkit',
      meta: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tools_count: 1,
        triggers_count: 0,
      },
      is_local_toolkit: false,
      auth_config_details: [
        {
          name: 'OAUTH2',
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
    };

    it('should create auth config and initiate connection when no auth config exists', async () => {
      // Mock toolkit retrieval
      mockClient.toolkits.retrieve.mockResolvedValueOnce(mockToolkitResponse);

      // Mock empty auth config list
      mockClient.authConfigs.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock auth config creation
      mockClient.authConfigs.create.mockResolvedValueOnce({
        auth_config: {
          id: 'auth_config_123',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
          name: 'Test Toolkit Auth Config',
          tool_access_config: {
            tools_for_connected_account_creation: undefined,
          },
          no_of_connections: 0,
          status: 'ENABLED',
          uuid: 'uuid-1',
        },
        toolkit: {
          logo: 'https://example.com/logo.png',
          slug: toolkitSlug,
        },
      });

      // Mock connected accounts list
      mockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock connection initiation
      mockClient.connectedAccounts.create.mockResolvedValueOnce({
        id: 'conn_123',
        connectionData: {
          type: 'OAUTH2',
          val: {
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
            authScheme: 'OAUTH2',
          },
        },
      });

      const connectionRequest = await toolkits.authorize(userId, toolkitSlug);

      // Verify the flow
      expect(mockClient.toolkits.retrieve).toHaveBeenCalledWith(toolkitSlug);
      expect(mockClient.authConfigs.list).toHaveBeenCalledWith({
        toolkit_slug: toolkitSlug,
      });
      expect(mockClient.authConfigs.create).toHaveBeenCalledWith({
        toolkit: {
          slug: toolkitSlug,
        },
        auth_config: {
          type: 'use_composio_managed_auth',
          name: 'Test Toolkit Auth Config',
          tool_access_config: {
            tools_for_connected_account_creation: undefined,
          },
        },
      });
      expect(mockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: 'auth_config_123',
        },
        connection: {
          user_id: userId,
        },
      });
      expect(connectionRequest).toHaveProperty('id', 'conn_123');
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
      expect(connectionRequest.redirectUrl).toBe('https://auth.example.com/connect');
    });

    it('should use existing auth config to initiate connection', async () => {
      // Mock toolkit retrieval
      mockClient.toolkits.retrieve.mockResolvedValueOnce(mockToolkitResponse);

      // Mock existing auth config
      mockClient.authConfigs.list.mockResolvedValueOnce({
        items: [
          {
            id: 'existing_auth_123',
            auth_scheme: 'OAUTH2',
            is_composio_managed: true,
            is_disabled: false,
            name: 'Existing Auth Config',
            no_of_connections: 1,
            status: 'ENABLED',
            uuid: 'uuid-1',
            toolkit: {
              logo: 'https://example.com/logo.png',
              slug: toolkitSlug,
            },
          },
        ],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock connected accounts list
      mockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock connection initiation
      mockClient.connectedAccounts.create.mockResolvedValueOnce({
        id: 'conn_123',
        connectionData: {
          val: {
            status: 'INITIALIZING',
            redirectUrl: 'https://auth.example.com/connect',
            authScheme: 'OAUTH2',
          },
        },
      });

      const connectionRequest = await toolkits.authorize(userId, toolkitSlug);

      // Verify the flow
      expect(mockClient.toolkits.retrieve).toHaveBeenCalledWith(toolkitSlug);
      expect(mockClient.authConfigs.list).toHaveBeenCalledWith({
        toolkit_slug: toolkitSlug,
      });
      expect(mockClient.authConfigs.create).not.toHaveBeenCalled();
      expect(mockClient.connectedAccounts.create).toHaveBeenCalledWith({
        auth_config: {
          id: 'existing_auth_123',
        },
        connection: {
          user_id: userId,
        },
      });
      expect(connectionRequest).toHaveProperty('id', 'conn_123');
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
      expect(connectionRequest.redirectUrl).toBe('https://auth.example.com/connect');
    });

    it('should throw ComposioAuthConfigNotFoundError when toolkit has no auth config details', async () => {
      // Mock toolkit retrieval with no auth config details
      mockClient.toolkits.retrieve.mockResolvedValueOnce({
        ...mockToolkitResponse,
        auth_config_details: [], // Empty auth config details
      });

      // Mock empty auth config list
      mockClient.authConfigs.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      const promise = toolkits.authorize(userId, toolkitSlug);

      await expect(promise).rejects.toThrow(ComposioAuthConfigNotFoundError);
      await expect(promise).rejects.toThrow(`No auth configs found for toolkit ${toolkitSlug}`);
      expect(mockClient.authConfigs.create).not.toHaveBeenCalled();
      expect(mockClient.connectedAccounts.create).not.toHaveBeenCalled();
    });

    it('should throw ComposioAuthConfigNotFoundError when auth config creation fails', async () => {
      // Mock toolkit retrieval
      mockClient.toolkits.retrieve.mockResolvedValueOnce(mockToolkitResponse);

      // Mock empty auth config list
      mockClient.authConfigs.list.mockResolvedValueOnce({
        items: [],
        next_cursor: null,
        total_pages: 1,
      });

      // Mock auth config creation failure with ComposioClient.APIError
      const apiError = new ComposioClient.APIError(
        400,
        'Bad Request',
        'Bad Request',
        new Headers()
      );
      mockClient.authConfigs.create.mockRejectedValueOnce(apiError);

      const promise = toolkits.authorize(userId, toolkitSlug);

      await expect(promise).rejects.toThrow(ComposioAuthConfigNotFoundError);
      await expect(promise).rejects.toThrow(
        `No Default auth config found for toolkit ${toolkitSlug}`
      );
      expect(mockClient.connectedAccounts.create).not.toHaveBeenCalled();
    });

    it('should throw ComposioToolkitNotFoundError when toolkit does not exist', async () => {
      mockClient.toolkits.retrieve.mockRejectedValue(
        new APIError(400, 'Toolkit not found', 'Toolkit not found', new Headers())
      );

      const promise = toolkits.authorize('user-123', 'non-existent');

      await expect(promise).rejects.toThrow("Couldn't fetch Toolkit with slug: non-existent");
      expect(mockClient.authConfigs.list).not.toHaveBeenCalled();
      expect(mockClient.authConfigs.create).not.toHaveBeenCalled();
      expect(mockClient.connectedAccounts.create).not.toHaveBeenCalled();
    });
  });

  describe('getAuthConfigCreationFields', () => {
    const toolkitSlug = 'test-toolkit';
    const mockToolkit = {
      authConfigDetails: [
        {
          name: 'oauth2',
          mode: 'OAUTH2',
          fields: {
            authConfigCreation: {
              required: [{ name: 'client_id' }, { name: 'client_secret' }],
              optional: [{ name: 'redirect_uri' }],
            },
            connectedAccountInitiation: {
              required: [{ name: 'code' }],
              optional: [{ name: 'state' }],
            },
          },
        },
      ],
    };

    beforeEach(() => {
      vi.spyOn(Toolkits.prototype as any, 'getToolkitBySlug').mockResolvedValue(mockToolkit as any);
    });

    it('returns all fields when requiredOnly is false', async () => {
      const result = await toolkits.getAuthConfigCreationFields(
        toolkitSlug,
        AuthSchemeTypes.OAUTH2,
        {
          requiredOnly: false,
        }
      );
      expect(result).toEqual([
        { name: 'client_id', required: true },
        { name: 'client_secret', required: true },
        { name: 'redirect_uri', required: false },
      ]);
    });

    it('returns only required fields when requiredOnly is true', async () => {
      const result = await toolkits.getAuthConfigCreationFields(
        toolkitSlug,
        AuthSchemeTypes.OAUTH2,
        {
          requiredOnly: true,
        }
      );
      expect(result).toEqual([
        { name: 'client_id', required: true },
        { name: 'client_secret', required: true },
      ]);
    });

    it('selects the correct auth config by authScheme', async () => {
      const multiToolkit = {
        authConfigDetails: [
          {
            name: 'oauth2',
            mode: 'OAUTH2',
            fields: {
              authConfigCreation: {
                required: [{ name: 'client_id' }],
                optional: [],
              },
              connectedAccountInitiation: {
                required: [],
                optional: [],
              },
            },
          },
          {
            name: 'api_key',
            mode: 'API_KEY',
            fields: {
              authConfigCreation: {
                required: [{ name: 'api_key' }],
                optional: [],
              },
              connectedAccountInitiation: {
                required: [],
                optional: [],
              },
            },
          },
        ],
      };
      (Toolkits.prototype as any).getToolkitBySlug = vi.fn().mockResolvedValueOnce(multiToolkit);
      const result = await toolkits.getAuthConfigCreationFields(
        toolkitSlug,
        AuthSchemeTypes.API_KEY,
        {
          requiredOnly: true,
        }
      );
      expect(result).toEqual([{ name: 'api_key', required: true }]);
    });

    it('throws if no authConfigDetails', async () => {
      (Toolkits.prototype as any).getToolkitBySlug = vi.fn().mockResolvedValueOnce({});
      await expect(
        toolkits.getAuthConfigCreationFields(toolkitSlug, AuthSchemeTypes.API_KEY, {
          requiredOnly: true,
        })
      ).rejects.toThrow(ComposioAuthConfigNotFoundError);
    });
  });

  describe('getConnectedAccountInitiationFields', () => {
    const toolkitSlug = 'test-toolkit';
    const mockToolkit = {
      authConfigDetails: [
        {
          name: 'oauth2',
          mode: 'OAUTH2',
          fields: {
            authConfigCreation: {
              required: [],
              optional: [],
            },
            connectedAccountInitiation: {
              required: [{ name: 'code' }],
              optional: [{ name: 'state' }],
            },
          },
        },
      ],
    };

    beforeEach(() => {
      vi.spyOn(Toolkits.prototype as any, 'getToolkitBySlug').mockResolvedValue(mockToolkit as any);
    });

    it('returns all fields when requiredOnly is false', async () => {
      const result = await toolkits.getConnectedAccountInitiationFields(toolkitSlug, 'OAUTH2', {
        requiredOnly: false,
      });
      expect(result).toEqual([
        { name: 'code', required: true },
        { name: 'state', required: false },
      ]);
    });

    it('returns only required fields when requiredOnly is true', async () => {
      const result = await toolkits.getConnectedAccountInitiationFields(toolkitSlug, 'OAUTH2', {
        requiredOnly: true,
      });
      expect(result).toEqual([{ name: 'code', required: true }]);
    });

    it('selects the correct auth config by authScheme', async () => {
      const multiToolkit = {
        authConfigDetails: [
          {
            name: 'oauth2',
            mode: 'OAUTH2',
            fields: {
              authConfigCreation: {
                required: [],
                optional: [],
              },
              connectedAccountInitiation: {
                required: [{ name: 'code' }],
                optional: [],
              },
            },
          },
          {
            name: 'api_key',
            mode: 'API_KEY',
            fields: {
              authConfigCreation: {
                required: [],
                optional: [],
              },
              connectedAccountInitiation: {
                required: [{ name: 'api_key_code' }],
                optional: [],
              },
            },
          },
        ],
      };
      (Toolkits.prototype as any).getToolkitBySlug = vi.fn().mockResolvedValueOnce(multiToolkit);
      const result = await toolkits.getConnectedAccountInitiationFields(
        toolkitSlug,
        AuthSchemeTypes.API_KEY,
        {
          requiredOnly: true,
        }
      );
      expect(result).toEqual([{ name: 'api_key_code', required: true }]);
    });

    it('throws if no authConfigDetails', async () => {
      (Toolkits.prototype as any).getToolkitBySlug = vi.fn().mockResolvedValueOnce({});
      await expect(
        toolkits.getConnectedAccountInitiationFields(toolkitSlug, AuthSchemeTypes.API_KEY, {
          requiredOnly: true,
        })
      ).rejects.toThrow(ComposioAuthConfigNotFoundError);
    });
  });
});
