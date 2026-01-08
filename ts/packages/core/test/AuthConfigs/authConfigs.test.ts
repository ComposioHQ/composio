import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthConfigs } from '../../src/models/AuthConfigs';
import ComposioClient from '@composio/client';
import { ValidationError } from '../../src/errors/ValidationErrors';
import { ZodError } from 'zod/v3';
import {
  AuthConfigRetrieveResponse as ComposioAuthConfigRetrieveResponse,
  AuthConfigDeleteResponse,
  AuthConfigUpdateResponse,
  AuthConfigUpdateStatusResponse,
} from '@composio/client/resources/auth-configs';
import { transformAuthConfigRetrieveResponse } from '../../src/utils/transformers/authConfigs';

// Mock data for testing
const mockComposioAuthConfigResponse: ComposioAuthConfigRetrieveResponse = {
  id: 'auth_12345',
  name: 'Test Auth Config',
  no_of_connections: 5,
  status: 'ENABLED',
  deprecated_params: {
    default_connector_id: null,
    expected_input_fields: [],
    member_uuid: 'member_123',
    toolkit_id: 'toolkit_123',
  },
  type: 'custom',
  toolkit: {
    logo: 'https://example.com/logo.png',
    slug: 'github',
  },
  uuid: 'uuid-12345',
  auth_scheme: 'OAUTH2',
  credentials: {
    client_id: 'test_client_id',
    client_secret: 'test_client_secret',
  },
  expected_input_fields: [
    { name: 'client_id', type: 'string' },
    { name: 'client_secret', type: 'string' },
  ],
  is_composio_managed: true,
  created_by: 'user_123',
  created_at: '2023-01-01T00:00:00Z',
  last_updated_at: '2023-01-01T00:00:00Z',
  tool_access_config: {
    tools_for_connected_account_creation: undefined,
  },
};

const mockTransformedAuthConfigResponse = {
  id: 'auth_12345',
  name: 'Test Auth Config',
  noOfConnections: 5,
  status: 'ENABLED',
  toolkit: {
    logo: 'https://example.com/logo.png',
    slug: 'github',
  },
  uuid: 'uuid-12345',
  authScheme: 'OAUTH2',
  credentials: {
    client_id: 'test_client_id',
    client_secret: 'test_client_secret',
  },
  expectedInputFields: [
    { name: 'client_id', type: 'string' },
    { name: 'client_secret', type: 'string' },
  ],
  isComposioManaged: true,
  createdBy: 'user_123',
  createdAt: '2023-01-01T00:00:00Z',
  lastUpdatedAt: '2023-01-01T00:00:00Z',
  restrictToFollowingTools: undefined,
  toolAccessConfig: {
    toolsAvailableForExecution: undefined,
    toolsForConnectedAccountCreation: undefined,
  },
};

// Extended mock client with all AuthConfigs methods
const mockClient = {
  authConfigs: {
    list: vi.fn(),
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
  },
};

describe('AuthConfigs', () => {
  let authConfigs: AuthConfigs;

  beforeEach(() => {
    vi.clearAllMocks();
    authConfigs = new AuthConfigs(mockClient as unknown as ComposioClient);
  });

  describe('constructor', () => {
    it('should create an instance successfully with valid client', () => {
      expect(authConfigs).toBeInstanceOf(AuthConfigs);
    });

    it('should have protected getClient method for testing', () => {
      // @ts-expect-error - Accessing protected method for testing
      expect(authConfigs.getClient()).toBe(mockClient);
    });
  });

  describe('parseAuthConfigRetrieveResponse', () => {
    it('should transform API response to SDK format correctly', () => {
      const result = transformAuthConfigRetrieveResponse(mockComposioAuthConfigResponse);
      expect(result).toEqual(mockTransformedAuthConfigResponse);
    });

    // We have relaxed the validation for the response data, so we don't expect a ValidationError to be thrown
    // it('should throw ValidationError for invalid response data', () => {
    //   const invalidResponse = {
    //     ...mockComposioAuthConfigResponse,
    //     id: null, // Invalid: id should be string
    //   } as unknown as ComposioAuthConfigRetrieveResponse;

    //   expect(() => {
    //     // @ts-expect-error - Accessing private method for testing
    //     authConfigs.parseAuthConfigRetrieveResponse(invalidResponse);
    //   }).toThrow(ValidationError);
    // });

    it('should handle optional fields correctly', () => {
      const responseWithOptionalFields = {
        id: 'auth_12345',
        name: 'Test Auth Config',
        no_of_connections: 5,
        status: 'ENABLED',
        deprecated_params: {
          default_connector_id: null,
        },
        type: 'default',
        toolkit: {
          logo: 'https://example.com/logo.png',
          slug: 'github',
        },
        uuid: 'uuid-12345',
        // Optional fields omitted
      } as ComposioAuthConfigRetrieveResponse;

      const result = transformAuthConfigRetrieveResponse(responseWithOptionalFields);
      expect(result).toMatchObject({
        id: 'auth_12345',
        name: 'Test Auth Config',
        noOfConnections: 5,
        status: 'ENABLED',
        toolkit: {
          logo: 'https://example.com/logo.png',
          slug: 'github',
        },
        uuid: 'uuid-12345',
      });
    });
  });

  describe('list', () => {
    const mockListResponse = {
      items: [mockComposioAuthConfigResponse],
      next_cursor: 'next_cursor_123',
      total_pages: 1,
    };

    it('should list auth configs without query parameters', async () => {
      mockClient.authConfigs.list.mockResolvedValueOnce(mockListResponse);

      const result = await authConfigs.list();

      expect(mockClient.authConfigs.list).toHaveBeenCalledWith({
        cursor: undefined,
        is_composio_managed: undefined,
        limit: undefined,
        toolkit_slug: undefined,
      });

      expect(result).toEqual({
        items: [mockTransformedAuthConfigResponse],
        nextCursor: 'next_cursor_123',
        totalPages: 1,
      });
    });

    it('should list auth configs with query parameters', async () => {
      mockClient.authConfigs.list.mockResolvedValueOnce(mockListResponse);

      const query = {
        cursor: 'cursor_123',
        isComposioManaged: true,
        limit: 10,
        toolkit: 'github',
      };

      const result = await authConfigs.list(query);

      expect(mockClient.authConfigs.list).toHaveBeenCalledWith({
        cursor: 'cursor_123',
        is_composio_managed: true,
        limit: 10,
        toolkit_slug: 'github',
      });

      expect(result).toEqual({
        items: [mockTransformedAuthConfigResponse],
        nextCursor: 'next_cursor_123',
        totalPages: 1,
      });
    });

    it('should throw ValidationError for invalid query parameters', async () => {
      const invalidQuery = {
        limit: 'invalid_limit', // Should be number
      };

      await expect(
        // @ts-expect-error - Testing invalid input
        authConfigs.list(invalidQuery)
      ).rejects.toThrow(); // Just expect any error since Zod throws ZodError directly
    });

    it('should handle empty list response', async () => {
      const emptyResponse = {
        items: [],
        next_cursor: null, // Changed back to null as schema expects nullable string
        total_pages: 0,
      };

      mockClient.authConfigs.list.mockResolvedValueOnce(emptyResponse);

      const result = await authConfigs.list();

      expect(result).toEqual({
        items: [],
        nextCursor: null,
        totalPages: 0,
      });
    });
  });

  describe('create', () => {
    const mockCreateResponse = {
      auth_config: {
        id: 'auth_12345',
        auth_scheme: 'OAUTH2',
        is_composio_managed: true,
      },
      toolkit: {
        slug: 'github',
      },
    };

    it('should create auth config with default Composio managed type', async () => {
      mockClient.authConfigs.create.mockResolvedValueOnce(mockCreateResponse);

      const result = await authConfigs.create('github');

      expect(mockClient.authConfigs.create).toHaveBeenCalledWith({
        toolkit: {
          slug: 'github',
        },
        auth_config: {
          type: 'use_composio_managed_auth',
          credentials: undefined,
          name: undefined,
          tool_access_config: undefined,
        },
      });

      expect(result).toEqual({
        id: 'auth_12345',
        authScheme: 'OAUTH2',
        isComposioManaged: true,
        toolkit: 'github',
      });
    });

    it('should create custom auth config with credentials', async () => {
      mockClient.authConfigs.create.mockResolvedValueOnce({
        ...mockCreateResponse,
        auth_config: {
          ...mockCreateResponse.auth_config,
          is_composio_managed: false,
        },
      });

      const options = {
        type: 'use_custom_auth' as const,
        name: 'Custom GitHub Auth',
        tool_access_config: {
          tools_for_connected_account_creation: undefined,
        },
        authScheme: 'OAUTH2' as const,
        credentials: {
          client_id: 'test_client_id',
          client_secret: 'test_client_secret',
        },
      };

      const result = await authConfigs.create('github', options);

      expect(mockClient.authConfigs.create).toHaveBeenCalledWith({
        toolkit: {
          slug: 'github',
        },
        auth_config: {
          type: 'use_custom_auth',
          name: 'Custom GitHub Auth',
          authScheme: 'OAUTH2',
          credentials: {
            client_id: 'test_client_id',
            client_secret: 'test_client_secret',
          },
          proxy_config: undefined,
          tool_access_config: undefined,
        },
      });

      expect(result).toEqual({
        id: 'auth_12345',
        authScheme: 'OAUTH2',
        isComposioManaged: false,
        toolkit: 'github',
      });
    });

    it('should create Composio managed auth config with optional name', async () => {
      mockClient.authConfigs.create.mockResolvedValueOnce(mockCreateResponse);

      const options = {
        type: 'use_composio_managed_auth' as const,
        name: 'My GitHub Config',
        tool_access_config: {
          tools_for_connected_account_creation: undefined,
        },
        credentials: {
          custom_field: 'value',
        },
      };

      const result = await authConfigs.create('github', options);

      expect(mockClient.authConfigs.create).toHaveBeenCalledWith({
        toolkit: {
          slug: 'github',
        },
        auth_config: {
          type: 'use_composio_managed_auth',
          credentials: {
            custom_field: 'value',
          },
          name: 'My GitHub Config',
          tool_access_config: undefined,
        },
      });

      expect(result).toEqual({
        id: 'auth_12345',
        authScheme: 'OAUTH2',
        isComposioManaged: true,
        toolkit: 'github',
      });
    });

    it('should throw ValidationError for invalid create options', async () => {
      const invalidOptions = {
        type: 'use_custom_auth' as const,
        // Missing required authScheme for custom auth
        credentials: {
          client_id: 'test',
        },
      };

      await expect(
        // @ts-expect-error - Testing invalid input
        authConfigs.create('github', invalidOptions)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('get', () => {
    it('should retrieve auth config by nanoid', async () => {
      mockClient.authConfigs.retrieve.mockResolvedValueOnce(mockComposioAuthConfigResponse);

      const result = await authConfigs.get('auth_12345');

      expect(mockClient.authConfigs.retrieve).toHaveBeenCalledWith('auth_12345');
      expect(result).toEqual(mockTransformedAuthConfigResponse);
    });

    it('should handle API errors when retrieving auth config', async () => {
      const apiError = new Error('Auth config not found');
      mockClient.authConfigs.retrieve.mockRejectedValueOnce(apiError);

      await expect(authConfigs.get('nonexistent_auth')).rejects.toThrow('Auth config not found');
    });
  });

  describe('update', () => {
    const mockUpdateResponse: AuthConfigUpdateResponse = {
      id: 'auth_12345',
      status: 'success',
    };

    it('should update custom auth config with credentials', async () => {
      mockClient.authConfigs.update.mockResolvedValueOnce(mockUpdateResponse);

      const updateData = {
        type: 'custom' as const,
        credentials: {
          client_id: 'new_client_id',
          client_secret: 'new_client_secret',
        },
      };

      const result = await authConfigs.update('auth_12345', updateData);

      expect(mockClient.authConfigs.update).toHaveBeenCalledWith('auth_12345', {
        type: 'custom',
        credentials: {
          client_id: 'new_client_id',
          client_secret: 'new_client_secret',
        },
        proxy_config: undefined,
        shared_credentials: undefined,
        tool_access_config: undefined,
      });

      expect(result).toEqual(mockUpdateResponse);
    });

    it('should update default auth config with scopes', async () => {
      mockClient.authConfigs.update.mockResolvedValueOnce(mockUpdateResponse);

      const updateData = {
        type: 'default' as const,
        scopes: 'read:user,repo',
      };

      const result = await authConfigs.update('auth_12345', updateData);

      expect(mockClient.authConfigs.update).toHaveBeenCalledWith('auth_12345', {
        type: 'default',
        scopes: 'read:user,repo',
        shared_credentials: undefined,
        tool_access_config: undefined,
      });

      expect(result).toEqual(mockUpdateResponse);
    });

    it('should handle optional restrictToFollowingTools parameter', async () => {
      mockClient.authConfigs.update.mockResolvedValueOnce(mockUpdateResponse);

      const updateData = {
        type: 'custom' as const,
        credentials: {
          api_key: 'new_api_key',
        },
      };

      const result = await authConfigs.update('auth_12345', updateData);

      expect(mockClient.authConfigs.update).toHaveBeenCalledWith('auth_12345', {
        type: 'custom',
        credentials: {
          api_key: 'new_api_key',
        },
        proxy_config: undefined,
        shared_credentials: undefined,
        tool_access_config: undefined,
      });

      expect(result).toEqual(mockUpdateResponse);
    });

    it('should throw ValidationError for invalid update data', async () => {
      const invalidUpdateData = {
        type: 'invalid_type' as const,
        credentials: {},
      };

      await expect(
        // @ts-expect-error - Testing invalid input
        authConfigs.update('auth_12345', invalidUpdateData)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle API errors during update', async () => {
      const apiError = new Error('Update failed');
      mockClient.authConfigs.update.mockRejectedValueOnce(apiError);

      const updateData = {
        type: 'custom' as const,
        credentials: {
          api_key: 'key',
        },
      };

      await expect(authConfigs.update('auth_12345', updateData)).rejects.toThrow('Update failed');
    });
  });

  describe('delete', () => {
    const mockDeleteResponse: AuthConfigDeleteResponse = {
      id: 'auth_12345',
      status: 'deleted',
    };

    it('should delete auth config by nanoid', async () => {
      mockClient.authConfigs.delete.mockResolvedValueOnce(mockDeleteResponse);

      const result = await authConfigs.delete('auth_12345');

      expect(mockClient.authConfigs.delete).toHaveBeenCalledWith('auth_12345');
      expect(result).toEqual(mockDeleteResponse);
    });

    it('should handle API errors during deletion', async () => {
      const apiError = new Error('Delete failed');
      mockClient.authConfigs.delete.mockRejectedValueOnce(apiError);

      await expect(authConfigs.delete('auth_12345')).rejects.toThrow('Delete failed');
    });
  });

  describe('updateStatus', () => {
    const mockStatusUpdateResponse: AuthConfigUpdateStatusResponse = {
      id: 'auth_12345',
      status: 'ENABLED',
    };

    it('should update status to ENABLED', async () => {
      mockClient.authConfigs.updateStatus.mockResolvedValueOnce(mockStatusUpdateResponse);

      const result = await authConfigs.updateStatus('ENABLED', 'auth_12345');

      expect(mockClient.authConfigs.updateStatus).toHaveBeenCalledWith('ENABLED', {
        nanoid: 'auth_12345',
      });
      expect(result).toEqual(mockStatusUpdateResponse);
    });

    it('should update status to DISABLED', async () => {
      const disabledResponse = {
        id: 'auth_12345',
        status: 'DISABLED',
      };
      mockClient.authConfigs.updateStatus.mockResolvedValueOnce(disabledResponse);

      const result = await authConfigs.updateStatus('DISABLED', 'auth_12345');

      expect(mockClient.authConfigs.updateStatus).toHaveBeenCalledWith('DISABLED', {
        nanoid: 'auth_12345',
      });
      expect(result).toEqual(disabledResponse);
    });

    it('should handle API errors during status update', async () => {
      const apiError = new Error('Status update failed');
      mockClient.authConfigs.updateStatus.mockRejectedValueOnce(apiError);

      await expect(authConfigs.updateStatus('ENABLED', 'auth_12345')).rejects.toThrow(
        'Status update failed'
      );
    });
  });

  describe('enable', () => {
    const mockStatusUpdateResponse: AuthConfigUpdateStatusResponse = {
      id: 'auth_12345',
      status: 'ENABLED',
    };

    it('should enable auth config', async () => {
      mockClient.authConfigs.updateStatus.mockResolvedValueOnce(mockStatusUpdateResponse);

      const result = await authConfigs.enable('auth_12345');

      expect(mockClient.authConfigs.updateStatus).toHaveBeenCalledWith('ENABLED', {
        nanoid: 'auth_12345',
      });
      expect(result).toEqual(mockStatusUpdateResponse);
    });

    it('should handle API errors during enable', async () => {
      const apiError = new Error('Enable failed');
      mockClient.authConfigs.updateStatus.mockRejectedValueOnce(apiError);

      await expect(authConfigs.enable('auth_12345')).rejects.toThrow('Enable failed');
    });
  });

  describe('disable', () => {
    const mockStatusUpdateResponse: AuthConfigUpdateStatusResponse = {
      id: 'auth_12345',
      status: 'DISABLED',
    };

    it('should disable auth config', async () => {
      mockClient.authConfigs.updateStatus.mockResolvedValueOnce(mockStatusUpdateResponse);

      const result = await authConfigs.disable('auth_12345');

      expect(mockClient.authConfigs.updateStatus).toHaveBeenCalledWith('DISABLED', {
        nanoid: 'auth_12345',
      });
      expect(result).toEqual(mockStatusUpdateResponse);
    });

    it('should handle API errors during disable', async () => {
      const apiError = new Error('Disable failed');
      mockClient.authConfigs.updateStatus.mockRejectedValueOnce(apiError);

      await expect(authConfigs.disable('auth_12345')).rejects.toThrow('Disable failed');
    });
  });

  describe('error handling', () => {
    // We have relaxed the validation for auth config response, so we don't throw an error when parsing fails
    // it('should preserve ValidationError details when parsing fails', async () => {
    //   const invalidResponse = {
    //     id: null, // Invalid: id should be string
    //     name: 'Test Config',
    //     no_of_connections: 5,
    //     status: 'ENABLED',
    //     deprecated_params: {
    //       default_connector_id: null,
    //     },
    //     type: 'custom',
    //     toolkit: {
    //       logo: 'valid_logo',
    //       slug: 'valid_slug',
    //     },
    //     uuid: 'uuid-123',
    //   } as unknown as ComposioAuthConfigRetrieveResponse;

    //   expect(() => {
    //     // @ts-expect-error - Accessing private method for testing
    //     authConfigs.parseAuthConfigRetrieveResponse(invalidResponse);
    //   }).toThrow(ValidationError);

    //   try {
    //     // @ts-expect-error - Accessing private method for testing
    //     authConfigs.parseAuthConfigRetrieveResponse(invalidResponse);
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(ValidationError);
    //     expect((error as ValidationError).message).toContain(
    //       'Failed to parse auth config response'
    //     );
    //     expect((error as ValidationError).cause).toBeInstanceOf(ZodError);
    //   }
    // });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      mockClient.authConfigs.list.mockRejectedValueOnce(networkError);

      await expect(authConfigs.list()).rejects.toThrow('Network error');
    });
  });

  describe('edge cases', () => {
    it('should handle auth config with minimal fields', () => {
      const minimalResponse = {
        id: 'auth_minimal',
        name: 'Minimal Config',
        no_of_connections: 0,
        status: 'DISABLED',
        deprecated_params: {
          default_connector_id: null,
        },
        type: 'default',
        toolkit: {
          logo: '',
          slug: 'minimal-toolkit',
        },
        uuid: 'uuid-minimal',
      } as ComposioAuthConfigRetrieveResponse;

      const result = transformAuthConfigRetrieveResponse(minimalResponse);

      expect(result).toMatchObject({
        id: 'auth_minimal',
        name: 'Minimal Config',
        noOfConnections: 0,
        status: 'DISABLED',
        toolkit: {
          logo: '',
          slug: 'minimal-toolkit',
        },
        uuid: 'uuid-minimal',
      });
    });

    it('should handle large credential objects', async () => {
      const largeCredentials = {
        field1: 'value1',
        field2: 'value2',
        field3: { nested: 'object' },
        field4: ['array', 'values'],
        field5: 12345,
        field6: true,
      };

      const updateData = {
        type: 'custom' as const,
        credentials: largeCredentials,
      };

      const mockUpdateResponse: AuthConfigUpdateResponse = {
        id: 'auth_12345',
        status: 'success',
      };

      mockClient.authConfigs.update.mockResolvedValueOnce(mockUpdateResponse);

      const result = await authConfigs.update('auth_12345', updateData);

      expect(mockClient.authConfigs.update).toHaveBeenCalledWith('auth_12345', {
        type: 'custom',
        credentials: largeCredentials,
        proxy_config: undefined,
        shared_credentials: undefined,
        tool_access_config: undefined,
      });

      expect(result).toEqual(mockUpdateResponse);
    });

    it('should handle very long scopes string', async () => {
      const longScopes = Array(100).fill('scope').join(',');

      const updateData = {
        type: 'default' as const,
        scopes: longScopes,
      };

      const mockUpdateResponse: AuthConfigUpdateResponse = {
        id: 'auth_12345',
        status: 'success',
      };

      mockClient.authConfigs.update.mockResolvedValueOnce(mockUpdateResponse);

      const result = await authConfigs.update('auth_12345', updateData);

      expect(mockClient.authConfigs.update).toHaveBeenCalledWith('auth_12345', {
        type: 'default',
        scopes: longScopes,
        shared_credentials: undefined,
        tool_access_config: undefined,
      });

      expect(result).toEqual(mockUpdateResponse);
    });
  });
});
