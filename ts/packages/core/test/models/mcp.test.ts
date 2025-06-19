import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCP } from '../../src/models/MCP';
import ComposioClient from '@composio/client';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ValidationError } from '../../src/errors/ValidationErrors';
import { BaseAgenticProvider } from '../../src/provider/BaseProvider';
import { Tool } from '../../src/types/tool.types';
import { ExecuteToolFn } from '../../src/types/provider.types';
import { McpUrlResponse } from '../../src/types/mcp.types';
import {
  transformMcpCreateResponse,
  transformMcpListResponse,
  transformMcpRetrieveResponse,
  transformMcpDeleteResponse,
  transformMcpUpdateResponse,
  transformMcpGenerateUrlResponse,
} from '../../src/utils/transformers/mcp';

// Mock dependencies
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

// Define types for mock responses
interface MockItem {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
}

interface MockListResponse {
  items?: MockItem[];
}

vi.mock('../../src/utils/transformers/mcp', () => ({
  transformMcpCreateResponse: vi.fn(response => ({
    id: response.id,
    name: response.name,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    status: response.status,
  })),
  transformMcpListResponse: vi.fn((response: MockListResponse) => ({
    items: response.items?.map(item => ({
      id: item.id,
      name: item.name,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      status: item.status,
    })),
  })),
  transformMcpRetrieveResponse: vi.fn(response => ({
    id: response.id,
    name: response.name,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    status: response.status,
    toolkits: response.toolkits,
    tools: response.tools,
    managedAuthViaComposio: response.managed_auth_via_composio,
  })),
  transformMcpDeleteResponse: vi.fn(response => ({
    id: response.id,
    deleted: response.deleted,
    message: response.message,
  })),
  transformMcpUpdateResponse: vi.fn(response => ({
    id: response.id,
    name: response.name,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    status: response.status,
    toolkits: response.toolkits,
    tools: response.tools,
  })),
  transformMcpGenerateUrlResponse: vi.fn(response => ({
    connectedAccountUrls: response.connected_account_urls,
    userIdsUrl: response.user_ids_url,
    mcpUrl: response.mcp_url,
  })),
}));

// Create mock client with MCP-related methods
const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  mcp: {
    custom: {
      create: vi.fn(),
    },
    generate: {
      url: vi.fn(),
    },
    list: vi.fn(),
    retrieve: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
});

// Mock response data
const mockCreateResponse = {
  id: 'mcp_123',
  name: 'test-mcp-server',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  status: 'active',
};

const mockListResponse = {
  items: [
    {
      id: 'mcp_123',
      name: 'test-mcp-server',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      status: 'active',
    },
    {
      id: 'mcp_456',
      name: 'another-mcp-server',
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      status: 'active',
    },
  ],
};

const mockRetrieveResponse = {
  id: 'mcp_123',
  name: 'test-mcp-server',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  status: 'active',
  toolkits: ['gmail', 'github'],
  tools: ['GMAIL_FETCH_EMAILS', 'GITHUB_GET_REPO'],
  managed_auth_via_composio: true,
};

const mockGenerateUrlResponse = {
  connected_account_urls: ['https://mcp.example.com/account1', 'https://mcp.example.com/account2'],
  user_ids_url: ['https://mcp.example.com/user1', 'https://mcp.example.com/user2'],
  mcp_url: 'https://mcp.example.com/server',
};

// Define types for mock provider
type MockTool = Tool & { mockWrapped: boolean };
type MockToolCollection = MockTool[];
type MockMcpResponse = {
  customFormat: boolean;
  serverName: string;
  urls: string[];
};

// Mock provider
class MockProvider extends BaseAgenticProvider<MockToolCollection, MockTool, MockMcpResponse> {
  readonly name = 'mock-provider';

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): MockTool {
    return { ...tool, mockWrapped: true };
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): MockToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }

  wrapMcpServerResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): MockMcpResponse {
    return {
      customFormat: true,
      serverName,
      urls: data.connected_account_urls || [data.mcp_url],
    };
  }
}

describe('MCP', () => {
  let mcp: MCP;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockProvider: MockProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mcp = new MCP(mockClient as unknown as ComposioClient);
  });

  describe('constructor', () => {
    it('should create an instance successfully', () => {
      expect(mcp).toBeInstanceOf(MCP);
      expect(telemetry.instrument).toHaveBeenCalledWith(mcp);
    });

    it('should store the client reference', () => {
      expect(mcp['client']).toBe(mockClient);
    });

    it('should accept an optional provider', () => {
      mockProvider = new MockProvider();
      const mcpWithProvider = new MCP(mockClient as unknown as ComposioClient, mockProvider);
      expect(mcpWithProvider['provider']).toBe(mockProvider);
    });
  });

  describe('create', () => {
    const toolkitConfigs = [
      {
        toolkit: 'gmail',
        authConfigId: 'ac_gmail123',
        allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
      },
    ];

    it('should create an MCP server successfully', async () => {
      mockClient.mcp.custom.create.mockResolvedValue(mockCreateResponse);

      const result = await mcp.create('test-server', toolkitConfigs, {
        useComposioManagedAuth: true,
      });

      expect(mockClient.mcp.custom.create).toHaveBeenCalledWith({
        name: 'test-server',
        toolkits: ['gmail'],
        custom_tools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
        managed_auth_via_composio: true,
        auth_config_ids: ['ac_gmail123'],
      });

      expect(result).toMatchObject({
        id: 'mcp_123',
        name: 'test-mcp-server',
        toolkits: ['gmail'],
      });

      expect(result.getServer).toBeDefined();
      expect(typeof result.getServer).toBe('function');
    });

    it('should validate toolkit configurations', async () => {
      const invalidConfigs = [
        {
          toolkit: '', // Empty toolkit
          authConfigId: 'ac_123',
          allowedTools: ['TOOL_1'],
        },
      ];

      await expect(mcp.create('test-server', invalidConfigs)).rejects.toThrow(ValidationError);
    });

    it('should validate auth options', async () => {
      const invalidAuthOptions = {
        useComposioManagedAuth: 'true' as unknown as boolean, // Should be boolean
      };

      await expect(mcp.create('test-server', toolkitConfigs, invalidAuthOptions)).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError when duplicate toolkits are provided', async () => {
      const duplicateConfigs = [
        {
          toolkit: 'gmail',
          authConfigId: 'ac_gmail123',
          allowedTools: ['GMAIL_FETCH_EMAILS'],
        },
        {
          toolkit: 'gmail',
          authConfigId: 'ac_gmail456',
          allowedTools: ['GMAIL_SEND_EMAIL'],
        },
      ];

      await expect(mcp.create('test-server', duplicateConfigs)).rejects.toThrow(
        'Duplicate toolkits are not allowed'
      );
    });

    it('should handle server creation errors', async () => {
      mockClient.mcp.custom.create.mockRejectedValue(new Error('Server creation failed'));

      await expect(mcp.create('test-server', toolkitConfigs)).rejects.toThrow(
        'Failed to create MCP server'
      );
    });
  });

  describe('getServer', () => {
    beforeEach(() => {
      // Mock the get method that getServer calls internally
      vi.spyOn(mcp, 'get').mockResolvedValue({
        id: mockRetrieveResponse.id,
        name: mockRetrieveResponse.name,
        createdAt: mockRetrieveResponse.created_at,
        updatedAt: mockRetrieveResponse.updated_at,
        status: mockRetrieveResponse.status,
        toolkits: mockRetrieveResponse.toolkits,
        tools: mockRetrieveResponse.tools,
        managedAuthViaComposio: mockRetrieveResponse.managed_auth_via_composio,
      });
    });

    it('should get server URLs with connected account IDs', async () => {
      mockClient.mcp.generate.url.mockResolvedValue(mockGenerateUrlResponse);

      const result = await mcp.getServer('mcp_123', {
        connectedAccountIds: {
          gmail: 'account_123',
          github: 'account_456',
        },
      });

      expect(mockClient.mcp.generate.url).toHaveBeenCalledWith({
        user_ids: [],
        connected_account_ids: ['account_123', 'account_456'],
        mcp_server_id: 'mcp_123',
        managed_auth_by_composio: true,
      });

      expect(result).toBeDefined();
    });

    it('should get server URLs with user ID', async () => {
      mockClient.mcp.generate.url.mockResolvedValue(mockGenerateUrlResponse);

      const result = await mcp.getServer('mcp_123', {
        userId: 'user_123',
      });

      expect(mockClient.mcp.generate.url).toHaveBeenCalledWith({
        user_ids: ['user_123'],
        connected_account_ids: [],
        mcp_server_id: 'mcp_123',
        managed_auth_by_composio: true,
      });
    });

    it('should validate that either userId or connectedAccountIds is provided', async () => {
      await expect(mcp.getServer('mcp_123', {})).rejects.toThrow(
        'Must provide either userId or connectedAccountIds, but not both'
      );
    });

    it('should validate that both userId and connectedAccountIds are not provided', async () => {
      await expect(
        mcp.getServer('mcp_123', {
          userId: 'user_123',
          connectedAccountIds: { gmail: 'account_123' },
        })
      ).rejects.toThrow('Must provide either userId or connectedAccountIds, but not both');
    });

    it('should validate toolkit names in connectedAccountIds', async () => {
      await expect(
        mcp.getServer('mcp_123', {
          connectedAccountIds: {
            slack: 'account_123', // Not in server's toolkits
          },
        })
      ).rejects.toThrow('Invalid toolkits provided: slack');
    });

    it('should use custom provider transformation', async () => {
      mockProvider = new MockProvider();
      const mcpWithProvider = new MCP(mockClient as unknown as ComposioClient, mockProvider);
      vi.spyOn(mcpWithProvider, 'get').mockResolvedValue({
        id: mockRetrieveResponse.id,
        name: mockRetrieveResponse.name,
        createdAt: mockRetrieveResponse.created_at,
        updatedAt: mockRetrieveResponse.updated_at,
        status: mockRetrieveResponse.status,
        toolkits: mockRetrieveResponse.toolkits,
        tools: mockRetrieveResponse.tools,
        managedAuthViaComposio: mockRetrieveResponse.managed_auth_via_composio,
      });

      mockClient.mcp.generate.url.mockResolvedValue(mockGenerateUrlResponse);

      const result = await mcpWithProvider.getServer('mcp_123', {
        userId: 'user_123',
      });

      expect(result).toMatchObject({
        customFormat: true,
        serverName: 'test-mcp-server-user_123',
      });
    });
  });

  describe('list', () => {
    it('should list MCP servers with default options', async () => {
      mockClient.mcp.list.mockResolvedValue(mockListResponse);

      const result = await mcp.list({});

      expect(mockClient.mcp.list).toHaveBeenCalledWith({
        page_no: 1,
        limit: 10,
        toolkits: '',
        auth_config_ids: '',
        name: undefined,
      });

      expect(result).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'mcp_123',
            name: 'test-mcp-server',
          }),
        ]),
      });
    });

    it('should list MCP servers with filters', async () => {
      mockClient.mcp.list.mockResolvedValue(mockListResponse);

      const result = await mcp.list({
        page: 2,
        limit: 20,
        toolkits: ['gmail', 'github'],
        authConfigs: ['auth_123', 'auth_456'],
        name: 'production',
      });

      expect(mockClient.mcp.list).toHaveBeenCalledWith({
        page_no: 2,
        limit: 20,
        toolkits: 'gmail,github',
        auth_config_ids: 'auth_123,auth_456',
        name: 'production',
      });
    });

    it('should handle list errors', async () => {
      mockClient.mcp.list.mockRejectedValue(new Error('List failed'));

      await expect(mcp.list({})).rejects.toThrow('Failed to list MCP servers');
    });
  });

  describe('get', () => {
    it('should retrieve an MCP server by ID', async () => {
      mockClient.mcp.retrieve.mockResolvedValue(mockRetrieveResponse);

      const result = await mcp.get('mcp_123');

      expect(mockClient.mcp.retrieve).toHaveBeenCalledWith('mcp_123');
      expect(result).toMatchObject({
        id: 'mcp_123',
        name: 'test-mcp-server',
        toolkits: ['gmail', 'github'],
      });
    });

    it('should handle retrieval errors', async () => {
      mockClient.mcp.retrieve.mockRejectedValue(new Error('Not found'));

      await expect(mcp.get('mcp_123')).rejects.toThrow('Failed to retrieve MCP server');
    });
  });

  describe('delete', () => {
    it('should delete an MCP server', async () => {
      const mockDeleteResponse = {
        id: 'mcp_123',
        deleted: true,
        message: 'Server deleted successfully',
      };

      mockClient.mcp.delete.mockResolvedValue(mockDeleteResponse);

      const result = await mcp.delete('mcp_123');

      expect(mockClient.mcp.delete).toHaveBeenCalledWith('mcp_123');
      expect(result).toMatchObject({
        id: 'mcp_123',
        deleted: true,
      });
    });

    it('should handle deletion errors', async () => {
      mockClient.mcp.delete.mockRejectedValue(new Error('Cannot delete'));

      await expect(mcp.delete('mcp_123')).rejects.toThrow('Failed to delete MCP server');
    });
  });

  describe('update', () => {
    const updatedConfigs = [
      {
        toolkit: 'gmail',
        authConfigId: 'ac_gmail789',
        allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_DRAFT'],
      },
    ];

    it('should update an MCP server', async () => {
      const mockUpdateResponse = {
        id: 'mcp_123',
        name: 'updated-server',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        status: 'active',
        toolkits: ['gmail'],
        tools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_DRAFT'],
      };

      mockClient.mcp.update.mockResolvedValue(mockUpdateResponse);

      const result = await mcp.update('mcp_123', 'updated-server', updatedConfigs, {
        useComposioManagedAuth: true,
      });

      expect(mockClient.mcp.update).toHaveBeenCalledWith('mcp_123', {
        name: 'updated-server',
        toolkits: ['gmail'],
        allowed_tools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_DRAFT'],
        managed_auth_via_composio: true,
      });

      expect(result).toMatchObject({
        id: 'mcp_123',
        name: 'updated-server',
      });
    });

    it('should validate update parameters', async () => {
      const invalidConfigs = [
        {
          toolkit: '',
          authConfigId: 'ac_123',
          allowedTools: [],
        },
      ];

      await expect(mcp.update('mcp_123', 'updated', invalidConfigs)).rejects.toThrow(
        ValidationError
      );
    });

    it('should handle update errors', async () => {
      mockClient.mcp.update.mockRejectedValue(new Error('Update failed'));

      await expect(mcp.update('mcp_123', 'updated', updatedConfigs)).rejects.toThrow(
        'Failed to update MCP server'
      );
    });
  });

  describe('generateUrl', () => {
    it('should generate URLs with valid parameters', async () => {
      mockClient.mcp.generate.url.mockResolvedValue(mockGenerateUrlResponse);

      const params = {
        user_ids: ['user123'],
        connected_account_ids: ['account456'],
        mcp_server_id: 'mcp_123',
        managed_auth_by_composio: true,
      };

      const result = await mcp.generateUrl(params);

      expect(mockClient.mcp.generate.url).toHaveBeenCalledWith({
        user_ids: ['user123'],
        connected_account_ids: ['account456'],
        mcp_server_id: 'mcp_123',
        managed_auth_by_composio: true,
      });

      expect(result).toMatchObject({
        connectedAccountUrls: [
          'https://mcp.example.com/account1',
          'https://mcp.example.com/account2',
        ],
        userIdsUrl: ['https://mcp.example.com/user1', 'https://mcp.example.com/user2'],
        mcpUrl: 'https://mcp.example.com/server',
      });
    });

    it('should validate parameters', async () => {
      const invalidParams = {
        user_ids: 'not-an-array' as unknown as string[], // Should be an array
        mcp_server_id: 'mcp_123',
      };

      await expect(mcp.generateUrl(invalidParams)).rejects.toThrow(ValidationError);
    });

    it('should handle URL generation errors', async () => {
      mockClient.mcp.generate.url.mockRejectedValue(new Error('Generation failed'));

      await expect(
        mcp.generateUrl({
          mcp_server_id: 'mcp_123',
          user_ids: ['user123'],
        })
      ).rejects.toThrow('Failed to generate MCP URL');
    });
  });

  describe('convenience getServer method', () => {
    it('should work on create response', async () => {
      mockClient.mcp.custom.create.mockResolvedValue(mockCreateResponse);
      mockClient.mcp.retrieve.mockResolvedValue(mockRetrieveResponse);
      mockClient.mcp.generate.url.mockResolvedValue(mockGenerateUrlResponse);

      const toolkitConfigs = [
        {
          toolkit: 'gmail',
          authConfigId: 'ac_gmail123',
          allowedTools: ['GMAIL_FETCH_EMAILS'],
        },
      ];

      const server = await mcp.create('test-server', toolkitConfigs);

      // Mock the internal get call
      vi.spyOn(mcp, 'get').mockResolvedValue({
        id: mockRetrieveResponse.id,
        name: mockRetrieveResponse.name,
        createdAt: mockRetrieveResponse.created_at,
        updatedAt: mockRetrieveResponse.updated_at,
        status: mockRetrieveResponse.status,
        toolkits: mockRetrieveResponse.toolkits,
        tools: mockRetrieveResponse.tools,
        managedAuthViaComposio: mockRetrieveResponse.managed_auth_via_composio,
      });

      const urls = await server.getServer({
        connectedAccountIds: { gmail: 'account_123' },
      });

      expect(urls).toBeDefined();
      expect(mockClient.mcp.generate.url).toHaveBeenCalled();
    });
  });

  describe('validation error messages', () => {
    it('should provide meaningful error messages for toolkit config validation', async () => {
      const invalidConfigs = [
        {
          toolkit: 'gmail',
          authConfigId: '', // Empty auth config ID
          allowedTools: ['GMAIL_FETCH_EMAILS'],
        },
      ];

      await expect(mcp.create('test-server', invalidConfigs)).rejects.toThrow(
        'Auth config ID cannot be empty'
      );
    });

    it('should provide meaningful error messages for empty allowed tools', async () => {
      const invalidConfigs = [
        {
          toolkit: 'gmail',
          authConfigId: 'ac_123',
          allowedTools: [], // Empty tools array
        },
      ];

      await expect(mcp.create('test-server', invalidConfigs)).rejects.toThrow(
        'At least one tool must be specified'
      );
    });
  });
});
