import { describe, it, expect } from 'vitest';
import {
  transformMcpCreateResponse,
  transformMcpListResponse,
  transformMcpRetrieveResponse,
  transformMcpDeleteResponse,
  transformMcpUpdateResponse,
  transformMcpGenerateUrlResponse,
} from '../../../src/utils/transformers/mcp';
import { ValidationError } from '../../../src/errors/ValidationErrors';

describe('MCP Transformers', () => {
  describe('transformMcpCreateResponse', () => {
    it('should transform snake_case create response to camelCase', () => {
      const snakeCaseResponse = {
        id: 'mcp_123',
        name: 'test-server',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        status: 'active',
      } as any;

      const result = transformMcpCreateResponse(snakeCaseResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        status: 'active',
      });
    });

    it('should handle missing optional fields', () => {
      const minimalResponse = {
        id: 'mcp_123',
        name: 'test-server',
      } as any;

      const result = transformMcpCreateResponse(minimalResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
      });
    });

    it('should throw ValidationError for invalid response', () => {
      const invalidResponse = {
        id: '', // Empty ID should fail validation
        name: 'test-server',
      } as any;

      expect(() => transformMcpCreateResponse(invalidResponse)).toThrow(ValidationError);
      expect(() => transformMcpCreateResponse(invalidResponse)).toThrow(
        'Failed to parse MCP create response'
      );
    });
  });

  describe('transformMcpListResponse', () => {
    it('should transform list response with items', () => {
      const snakeCaseResponse = {
        items: [
          {
            id: 'mcp_123',
            name: 'server-1',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            status: 'active',
          },
          {
            id: 'mcp_456',
            name: 'server-2',
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            status: 'inactive',
          },
        ],
      } as any;

      const result = transformMcpListResponse(snakeCaseResponse);

      expect(result).toEqual({
        items: [
          {
            id: 'mcp_123',
            name: 'server-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            status: 'active',
          },
          {
            id: 'mcp_456',
            name: 'server-2',
            createdAt: '2024-01-02T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            status: 'inactive',
          },
        ],
      });
    });

    it('should handle empty items array', () => {
      const emptyResponse = {
        items: [],
      } as any;

      const result = transformMcpListResponse(emptyResponse);

      expect(result).toEqual({
        items: [],
      });
    });

    it('should handle missing items', () => {
      const noItemsResponse = {} as any;

      const result = transformMcpListResponse(noItemsResponse);

      expect(result).toEqual({
        items: undefined,
      });
    });
  });

  describe('transformMcpRetrieveResponse', () => {
    it('should transform retrieve response with all fields', () => {
      const snakeCaseResponse = {
        id: 'mcp_123',
        name: 'test-server',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        status: 'active',
        toolkits: ['gmail', 'github'],
        tools: undefined,
        managed_auth_via_composio: true,
        mcp_url: 'https://mcp.example.com/server',
        commands: {
          claude: 'claude-command',
          cursor: 'cursor-command',
          windsurf: 'windsurf-command',
        },
      } as any;

      const result = transformMcpRetrieveResponse(snakeCaseResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        status: 'active',
        toolkits: ['gmail', 'github'],
        tools: undefined,
        managedAuthViaComposio: true,
        mcpUrl: 'https://mcp.example.com/server',
        commands: {
          claude: 'claude-command',
          cursor: 'cursor-command',
          windsurf: 'windsurf-command',
        },
      });
    });

    it('should handle minimal response', () => {
      const minimalResponse = {
        id: 'mcp_123',
        name: 'test-server',
        mcp_url: 'https://mcp.example.com/server',
        commands: {
          claude: 'claude-command',
          cursor: 'cursor-command',
          windsurf: 'windsurf-command',
        },
      } as any;

      const result = transformMcpRetrieveResponse(minimalResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
        mcpUrl: 'https://mcp.example.com/server',
        commands: {
          claude: 'claude-command',
          cursor: 'cursor-command',
          windsurf: 'windsurf-command',
        },
      });
    });

    it('should throw ValidationError for missing required fields', () => {
      const invalidResponse = {
        id: 'mcp_123',
        // Missing required 'name' field
      } as any;

      expect(() => transformMcpRetrieveResponse(invalidResponse)).toThrow(ValidationError);
    });
  });

  describe('transformMcpDeleteResponse', () => {
    it('should transform delete response', () => {
      const snakeCaseResponse = {
        id: 'mcp_123',
        deleted: true,
        message: 'Server deleted successfully',
      } as any;

      const result = transformMcpDeleteResponse(snakeCaseResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        deleted: true,
        message: 'Server deleted successfully',
      });
    });

    it('should handle response without optional fields', () => {
      const minimalResponse = {
        id: 'mcp_123',
      } as any;

      const result = transformMcpDeleteResponse(minimalResponse);

      expect(result).toEqual({
        id: 'mcp_123',
      });
    });
  });

  describe('transformMcpUpdateResponse', () => {
    it('should transform update response with all fields', () => {
      const snakeCaseResponse = {
        id: 'mcp_123',
        name: 'updated-server',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
        status: 'active',
        toolkits: ['gmail', 'slack'],
        tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE'],
      } as any;

      const result = transformMcpUpdateResponse(snakeCaseResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'updated-server',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
        status: 'active',
        toolkits: ['gmail', 'slack'],
        tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE'],
      });
    });

    it('should handle minimal update response', () => {
      const minimalResponse = {
        id: 'mcp_123',
        name: 'updated-server',
      } as any;

      const result = transformMcpUpdateResponse(minimalResponse);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'updated-server',
      });
    });

    it('should throw ValidationError for invalid response', () => {
      const invalidResponse = {
        id: 'mcp_123',
        name: '', // Empty name should fail validation
      } as any;

      expect(() => transformMcpUpdateResponse(invalidResponse)).toThrow(ValidationError);
      expect(() => transformMcpUpdateResponse(invalidResponse)).toThrow(
        'Failed to parse MCP update response'
      );
    });
  });

  describe('transformMcpGenerateUrlResponse', () => {
    it('should transform URL response with all fields', () => {
      const snakeCaseResponse = {
        connected_account_urls: [
          'https://mcp.example.com/account1',
          'https://mcp.example.com/account2',
        ],
        user_ids_url: ['https://mcp.example.com/user1', 'https://mcp.example.com/user2'],
        mcp_url: 'https://mcp.example.com/server',
      };

      const result = transformMcpGenerateUrlResponse(snakeCaseResponse);

      expect(result).toEqual({
        connectedAccountUrls: [
          'https://mcp.example.com/account1',
          'https://mcp.example.com/account2',
        ],
        userIdsUrl: ['https://mcp.example.com/user1', 'https://mcp.example.com/user2'],
        mcpUrl: 'https://mcp.example.com/server',
      });
    });

    it('should handle response with only mcp_url', () => {
      const minimalResponse = {
        mcp_url: 'https://mcp.example.com/server',
      };

      const result = transformMcpGenerateUrlResponse(minimalResponse);

      expect(result).toEqual({
        mcpUrl: 'https://mcp.example.com/server',
      });
    });

    it('should handle response with some optional arrays', () => {
      const partialResponse = {
        connected_account_urls: ['https://mcp.example.com/account1'],
        mcp_url: 'https://mcp.example.com/server',
      };

      const result = transformMcpGenerateUrlResponse(partialResponse);

      expect(result).toEqual({
        connectedAccountUrls: ['https://mcp.example.com/account1'],
        mcpUrl: 'https://mcp.example.com/server',
      });
    });

    it('should throw ValidationError for missing required mcp_url', () => {
      const invalidResponse = {
        connected_account_urls: ['https://mcp.example.com/account1'],
        // Missing required mcp_url
      };

      expect(() => transformMcpGenerateUrlResponse(invalidResponse)).toThrow(ValidationError);
      expect(() => transformMcpGenerateUrlResponse(invalidResponse)).toThrow(
        'Failed to parse MCP generate URL response'
      );
    });

    it('should throw ValidationError for empty mcp_url', () => {
      const invalidResponse = {
        mcp_url: '', // Empty URL should fail validation
      };

      expect(() => transformMcpGenerateUrlResponse(invalidResponse)).toThrow(ValidationError);
      expect(() => transformMcpGenerateUrlResponse(invalidResponse)).toThrow(
        'MCP URL cannot be empty'
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle null values gracefully', () => {
      const responseWithNulls = {
        id: 'mcp_123',
        name: 'test-server',
        created_at: null,
        updated_at: null,
        status: null,
      } as any;

      const result = transformMcpCreateResponse(responseWithNulls);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
        createdAt: null,
        updatedAt: null,
        status: null,
      });
    });

    it('should handle undefined values gracefully', () => {
      const responseWithUndefined = {
        id: 'mcp_123',
        name: 'test-server',
        created_at: undefined,
        updated_at: undefined,
        status: undefined,
      } as any;

      const result = transformMcpCreateResponse(responseWithUndefined);

      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
      });
    });

    it('should preserve additional unknown fields in responses', () => {
      const responseWithExtraFields = {
        id: 'mcp_123',
        name: 'test-server',
        created_at: '2024-01-01T00:00:00Z',
        some_unknown_field: 'value',
        nested_object: { key: 'value' },
      } as any;

      const result = transformMcpCreateResponse(responseWithExtraFields);

      // Should only include known fields
      expect(result).toEqual({
        id: 'mcp_123',
        name: 'test-server',
        createdAt: '2024-01-01T00:00:00Z',
      });
      expect(result).not.toHaveProperty('some_unknown_field');
      expect(result).not.toHaveProperty('nested_object');
    });
  });
});
