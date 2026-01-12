import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCP } from '../../src/models/MCP';
import ComposioClient from '@composio/client';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ValidationError } from '../../src/errors/ValidationErrors';

// Mock dependencies
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

// Create mock client with MCP methods
const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  mcp: {
    custom: {
      create: vi.fn(),
    },
    list: vi.fn(),
    retrieve: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    generate: {
      url: vi.fn(),
    },
  },
});

describe('MCP', () => {
  let mcp: MCP;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    mcp = new MCP(mockClient as unknown as ComposioClient);
  });

  describe('constructor', () => {
    it('should create an instance successfully', () => {
      expect(mcp).toBeInstanceOf(MCP);
      expect(mcp.client).toBe(mockClient);
    });

    it('should instrument the class with telemetry', () => {
      expect(telemetry.instrument).toHaveBeenCalledWith(mcp, 'MCP');
    });
  });

  describe('create', () => {
    it('should create an MCP server successfully', async () => {
      const mockResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: ['GMAIL_SEND_EMAIL'],
        auth_config_ids: ['auth_456'],
        commands: {
          claude: 'claude-command',
          cursor: 'cursor-command',
          windsurf: 'windsurf-command',
        },
        mcp_url: 'https://mcp.example.com/server',
      };

      mockClient.mcp.custom.create.mockResolvedValueOnce(mockResponse);

      const result = await mcp.create('test-server', {
        toolkits: ['gmail'],
        manuallyManageConnections: false,
      });

      expect(result).toHaveProperty('id', 'mcp_123');
      expect(result).toHaveProperty('name', 'test-server');
      expect(result).toHaveProperty('generate');
      expect(typeof result.generate).toBe('function');
      expect(mockClient.mcp.custom.create).toHaveBeenCalledWith({
        name: 'test-server',
        toolkits: ['gmail'],
        auth_config_ids: [],
        custom_tools: [],
        managed_auth_via_composio: true,
      });
    });

    it('should handle toolkits with auth config IDs', async () => {
      const mockResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: [],
        auth_config_ids: ['auth_456'],
        commands: {
          claude: 'cmd',
          cursor: 'cmd',
          windsurf: 'cmd',
        },
        mcp_url: 'https://mcp.example.com',
      };

      mockClient.mcp.custom.create.mockResolvedValueOnce(mockResponse);

      await mcp.create('test-server', {
        toolkits: [{ toolkit: 'gmail', authConfigId: 'auth_456' }],
      });

      expect(mockClient.mcp.custom.create).toHaveBeenCalledWith({
        name: 'test-server',
        toolkits: ['gmail'],
        auth_config_ids: [],
        custom_tools: [],
        managed_auth_via_composio: true,
      });
    });

    it('should validate configuration', async () => {
      await expect(mcp.create('test', { toolkits: null as any })).rejects.toThrow(ValidationError);
    });
  });

  describe('list', () => {
    it('should list MCP servers with default options', async () => {
      const mockResponse = {
        items: [
          {
            id: 'mcp_1',
            name: 'server-1',
            allowed_tools: ['TOOL_1'],
            auth_config_ids: ['auth_1'],
            commands: {
              claude: 'cmd',
              cursor: 'cmd',
              windsurf: 'cmd',
            },
            mcp_url: 'https://mcp.example.com',
            toolkit_icons: {},
            server_instance_count: 0,
            toolkits: ['gmail'],
          },
        ],
        current_page: 1,
        total_pages: 1,
      };

      mockClient.mcp.list.mockResolvedValueOnce(mockResponse);

      const result = await mcp.list({});

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('currentPage', 1);
      expect(result).toHaveProperty('totalPages', 1);
      expect(result.items).toHaveLength(1);
      expect(mockClient.mcp.list).toHaveBeenCalledWith({
        page_no: 1,
        limit: 10,
        toolkits: undefined,
        auth_config_ids: undefined,
        name: undefined,
      });
    });

    it('should list MCP servers with filters', async () => {
      const mockResponse = {
        items: [],
        current_page: 1,
        total_pages: 1,
      };

      mockClient.mcp.list.mockResolvedValueOnce(mockResponse);

      await mcp.list({
        page: 2,
        limit: 20,
        toolkits: ['gmail', 'slack'],
        authConfigs: ['auth_1'],
        name: 'test',
      });

      expect(mockClient.mcp.list).toHaveBeenCalledWith({
        page_no: 2,
        limit: 20,
        toolkits: 'gmail,slack',
        auth_config_ids: 'auth_1',
        name: 'test',
      });
    });

    it('should handle validation errors', async () => {
      await expect(mcp.list({ page: 'invalid' as any })).rejects.toThrow(ValidationError);
    });
  });

  describe('get', () => {
    it('should retrieve an MCP server by ID', async () => {
      const mockResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: ['GMAIL_SEND_EMAIL'],
        auth_config_ids: ['auth_456'],
        commands: {
          claude: 'cmd',
          cursor: 'cmd',
          windsurf: 'cmd',
        },
        mcp_url: 'https://mcp.example.com',
        toolkit_icons: {},
        server_instance_count: 5,
        toolkits: ['gmail'],
      };

      mockClient.mcp.retrieve.mockResolvedValueOnce(mockResponse);

      const result = await mcp.get('mcp_123');

      expect(result).toHaveProperty('id', 'mcp_123');
      expect(result).toHaveProperty('name', 'test-server');
      expect(result).toHaveProperty('serverInstanceCount', 5);
      expect(mockClient.mcp.retrieve).toHaveBeenCalledWith('mcp_123');
    });
  });

  describe('delete', () => {
    it('should delete an MCP server', async () => {
      const mockResponse = {
        id: 'mcp_123',
        deleted: true,
      };

      mockClient.mcp.delete.mockResolvedValueOnce(mockResponse);

      const result = await mcp.delete('mcp_123');

      expect(result).toEqual(mockResponse);
      expect(mockClient.mcp.delete).toHaveBeenCalledWith('mcp_123');
    });
  });

  describe('update', () => {
    it('should update an MCP server', async () => {
      const mockResponse = {
        id: 'mcp_123',
        name: 'updated-server',
        allowed_tools: ['NEW_TOOL'],
        auth_config_ids: ['auth_789'],
        commands: {
          claude: 'cmd',
          cursor: 'cmd',
          windsurf: 'cmd',
        },
        mcp_url: 'https://mcp.example.com',
        toolkit_icons: {},
        server_instance_count: 3,
        toolkits: ['slack'],
      };

      mockClient.mcp.update.mockResolvedValueOnce(mockResponse);

      const result = await mcp.update('mcp_123', {
        name: 'updated-server',
        toolkits: ['slack'],
      });

      expect(result).toHaveProperty('id', 'mcp_123');
      expect(result).toHaveProperty('name', 'updated-server');
      expect(mockClient.mcp.update).toHaveBeenCalledWith('mcp_123', {
        name: 'updated-server',
        custom_tools: undefined,
        toolkits: ['slack'],
        auth_config_ids: [],
      });
    });

    it('should validate update parameters', async () => {
      await expect(mcp.update('mcp_123', { toolkits: 'invalid' as any })).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('generate', () => {
    it('should generate server instance with valid parameters', async () => {
      const mockRetrieveResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: ['GMAIL_SEND_EMAIL'],
        auth_config_ids: ['auth_456'],
      };

      const mockUrlResponse = {
        user_ids_url: ['https://mcp.example.com/instance/user123'],
        connected_account_urls: [],
        mcp_url: 'https://mcp.example.com',
      };

      mockClient.mcp.retrieve.mockResolvedValueOnce(mockRetrieveResponse);
      mockClient.mcp.generate.url.mockResolvedValueOnce(mockUrlResponse);

      const result = await mcp.generate('user123', 'mcp_123');

      expect(result).toHaveProperty('id', 'mcp_123');
      expect(result).toHaveProperty('userId', 'user123');
      expect(result).toHaveProperty('type', 'streamable_http');
      expect(result).toHaveProperty('url', 'https://mcp.example.com/instance/user123');
      expect(mockClient.mcp.generate.url).toHaveBeenCalledWith({
        mcp_server_id: 'mcp_123',
        user_ids: ['user123'],
        managed_auth_by_composio: true,
      });
    });

    it('should handle manual connection management', async () => {
      const mockRetrieveResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: [],
        auth_config_ids: [],
      };

      const mockUrlResponse = {
        user_ids_url: ['https://mcp.example.com/instance/user123'],
        connected_account_urls: [],
        mcp_url: 'https://mcp.example.com',
      };

      mockClient.mcp.retrieve.mockResolvedValueOnce(mockRetrieveResponse);
      mockClient.mcp.generate.url.mockResolvedValueOnce(mockUrlResponse);

      await mcp.generate('user123', 'mcp_123', {
        manuallyManageConnections: true,
      });

      expect(mockClient.mcp.generate.url).toHaveBeenCalledWith({
        mcp_server_id: 'mcp_123',
        user_ids: ['user123'],
        managed_auth_by_composio: false,
      });
    });

    it('should validate parameters', async () => {
      const mockRetrieveResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: [],
        auth_config_ids: [],
      };

      mockClient.mcp.retrieve.mockResolvedValueOnce(mockRetrieveResponse);

      await expect(
        mcp.generate('user123', 'mcp_123', { manuallyManageConnections: 'invalid' as any })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('create response with generate method', () => {
    it('should create server and use the generate method', async () => {
      const mockCreateResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: ['GMAIL_SEND_EMAIL'],
        auth_config_ids: ['auth_456'],
        commands: {
          claude: 'cmd',
          cursor: 'cmd',
          windsurf: 'cmd',
        },
        mcp_url: 'https://mcp.example.com',
      };

      const mockRetrieveResponse = {
        id: 'mcp_123',
        name: 'test-server',
        allowed_tools: ['GMAIL_SEND_EMAIL'],
        auth_config_ids: ['auth_456'],
      };

      const mockUrlResponse = {
        user_ids_url: ['https://mcp.example.com/instance/user123'],
        connected_account_urls: [],
        mcp_url: 'https://mcp.example.com',
      };

      mockClient.mcp.custom.create.mockResolvedValueOnce(mockCreateResponse);
      mockClient.mcp.retrieve.mockResolvedValueOnce(mockRetrieveResponse);
      mockClient.mcp.generate.url.mockResolvedValueOnce(mockUrlResponse);

      const server = await mcp.create('test-server', {
        toolkits: ['gmail'],
      });

      expect(server.generate).toBeDefined();

      const instance = await server.generate('user123');

      expect(instance).toHaveProperty('userId', 'user123');
      expect(instance).toHaveProperty('url', 'https://mcp.example.com/instance/user123');
    });
  });
});
