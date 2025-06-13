/**
 * @fileoverview MCP class for Composio SDK, used to manage MCP servers.
 *
 * @author Apoorv Taneja <apoorv@composio.dev>
 * @date 2025-06-12
 * @module MCP
 */
import ComposioClient from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {
  MCPGenerateURLParams,
  MCPCreateMethodResponse,
  MCPToolkitConfig,
  MCPAuthOptions,
  MCPGetServerParams
} from '../types/mcp.types';
import {
  McpCreateResponse,
  McpListResponse,
  McpUpdateResponse,
  McpDeleteResponse,
  CustomCreateResponse,
  GenerateURLResponse
} from '@composio/client/resources/mcp';

/**
 * MCP (Model Control Protocol) class
 * Handles MCP server operations
 */
export class MCP {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this);
  }

  /**
   * Create a new MCP server
   * @param {string} name - Unique name for the MCP server
   * @param {MCPToolkitConfig[]} toolkitConfigs - Array of toolkit configurations
   * @param {MCPAuthOptions} [authOptions] - Authentication configuration options
   * @returns {Promise<MCPCreateMethodResponse>} Created server details with instance getter
   * 
   * @example
   * ```typescript
   * const cfg = await composio.mcp.create(
   *   "personal-mcp-server",
   *   [
   *     {
   *       toolkit: "GMAIL",
   *       authConfigId: "ac_sdhkjfhjksdk",
   *       allowedTools: ["GMAIL_FETCH_EMAILS"],
   *     },
   *   ],
   *   { useManagedAuthByComposio: true },
   * );
   * 
   * // Get server instance
   * const server = await cfg.getServer({
   *   connected_account_ids: {
   *     "gmail": "acc_123",
   *     "supabase": "acc_456"
   *   }
   * });
   * // OR
   * const server = await cfg.getServer({
   *   user_id: "user_123"
   * });
   * ```
   */
  async create(
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<MCPCreateMethodResponse> {
    // Check for unique toolkits
    const toolkits = toolkitConfigs.map(config => config.toolkit);
    const uniqueToolkits = new Set(toolkits);
    if (uniqueToolkits.size !== toolkits.length) {
      throw new Error('Duplicate toolkits are not allowed. Each toolkit must be unique.');
    }

    // Create a custom MCP server with the toolkit configurations
    const mcpServerCreatedResponse: CustomCreateResponse = await this.client.mcp.custom.create({
      name,
      toolkits: toolkits,
      custom_tools: toolkitConfigs.flatMap(config => config.allowedTools),
      managed_auth_via_composio: authOptions?.useManagedAuthByComposio || false,
      auth_config_ids: toolkitConfigs.map(config => config.authConfigId)
    });

    // Add getServer method to response
    return {
      ...mcpServerCreatedResponse,
      toolkits,
      getServer: async (params: MCPGetServerParams): Promise<GenerateURLResponse> => {
        // Validate that only one of user_id or connected_account_ids is provided
        if (params.user_id && params.connected_account_ids) {
          throw new Error('Cannot specify both user_id and connected_account_ids. Please provide only one.');
        }

        if (!params.user_id && !params.connected_account_ids) {
          throw new Error('Must provide either user_id or connected_account_ids.');
        }

        // If connected_account_ids is provided, verify toolkit names
        if (params.connected_account_ids) {
          const providedToolkits = Object.keys(params.connected_account_ids);
          const invalidToolkits = providedToolkits.filter(toolkit => !toolkits.includes(toolkit));
          if (invalidToolkits.length > 0) {
            throw new Error(`Invalid toolkits provided: ${invalidToolkits.join(', ')}. Available toolkits are: ${toolkits.join(', ')}`);
          }
        }

        const generateURLParams = {
          mcp_server_id: mcpServerCreatedResponse.id,
          user_ids: params.user_id ? [params.user_id] : [],
          connected_account_ids: params.connected_account_ids ? Object.values(params.connected_account_ids) : [],
          managed_auth_by_composio: authOptions?.useManagedAuthByComposio || false
        }
        return this.client.mcp.generate.url(generateURLParams);
      }
    } as MCPCreateMethodResponse;
  }

  /**
   * List MCP server configurations with filtering options
   * @param {Object} options - Filtering and pagination options
   * @param {number} [options.page] - Page number for pagination
   * @param {number} [options.limit] - Number of items per page
   * @param {string[]} [options.toolkits] - Filter servers by toolkit names
   * @param {string[]} [options.authConfigs] - Filter servers by auth config IDs
   * @param {string} [options.name] - Filter servers by name
   * @param {string} [options.user] - Filter servers by user ID
   * @returns {Promise<McpListResponse>} List of MCP servers matching the filters
   * 
   * @example
   * ```typescript
   * // List all servers with pagination
   * const servers = await composio.mcp.list({
   *   page: 1,
   *   limit: 10
   * });
   * 
   * // List Gmail and Supabase servers
   * const filteredServers = await composio.mcp.list({
   *   toolkits: ['GMAIL', 'SUPABASE'],
   *   authConfigIds: ['auth_123', 'auth_456']
   * });
   * ```
   */
  async list(options: {
    page?: number;
    limit?: number;
    toolkits?: string[];
    authConfigs?: string[];
    name?: string;
  }): Promise<McpListResponse> {

    return this.client.mcp.list({
      page_no: options.page || 1,
      limit: options.limit || 10,
      toolkits: options?.toolkits?.join(',') || '',
      auth_config_ids: options?.authConfigs?.join(',') || '',
      name: options?.name,
    });
  }

  /**
   * Get details of a specific MCP server
   * @param {string} id - Server UUID
   * @returns {Promise<McpCreateResponse>} Server details
   * 
   * @example
   * ```typescript
   * const serverDetails = await composio.mcp.get('server-uuid');
   * ```
   */
  async get(id: string): Promise<McpCreateResponse> {
    return this.client.mcp.retrieve(id);
  }

  /**
   * Delete an MCP server
   * @param {string} id - Server UUID
   * @returns {Promise<McpDeleteResponse>} Deletion response
   * 
   * @example
   * ```typescript
   * const result = await composio.mcp.delete('server-uuid');
   * ```
   */
  async delete(id: string): Promise<McpDeleteResponse> {
    return this.client.mcp.delete(id);
  }

  /**
   * Update an MCP server configuration
   * @param {string} id - Server UUID
   * @param {string} name - New unique name for the server
   * @param {MCPToolkitConfig[]} toolkitConfigs - Array of toolkit configurations
   * @param {MCPAuthOptions} [authOptions] - Updated authentication options
   * @returns {Promise<McpUpdateResponse>} Updated server details
   * 
   * @example
   * ```typescript
   * const updatedServer = await composio.mcp.update(
   *   "server-uuid",
   *   "my-updated-server",
   *   [
   *     {
   *       toolkit: "GMAIL",
   *       authConfigId: "ac_sdhkjfhjksdk",
   *       allowedTools: ["GMAIL_FETCH_EMAILS"],
   *     },
   *   ],
   *   {
   *     useManagedAuthByComposio: true,
   *   }
   * );
   * ```
   */
  async update(
    id: string,
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<McpUpdateResponse> {
    // Check for unique toolkits
    const toolkits = toolkitConfigs.map(config => config.toolkit);
    const uniqueToolkits = new Set(toolkits);
    if (uniqueToolkits.size !== toolkits.length) {
      throw new Error('Duplicate toolkits are not allowed. Each toolkit must be unique.');
    }

    return this.client.mcp.update(id, {
      name,
      toolkits: toolkits,
      allowed_tools: toolkitConfigs.flatMap(config => config.allowedTools),
      managed_auth_via_composio: authOptions?.useManagedAuthByComposio || false,
    });
  }
}