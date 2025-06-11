/**
 * @fileoverview MCP class for Composio SDK, used to manage MCP servers.
 *
 * @author Apoorv Taneja <apoorv@composio.dev>
 * @date 2025-06-11
 * @module MCP
 */
import ComposioClient from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {

  MCPCreateMethodResponse,
  MCPCreateConfig,
  MCPAuthOptions,
  MCPInstanceParams
} from '../types/mcp.types';
import {
  McpCreateResponse,
  McpListResponse,
  McpUpdateResponse,
  McpDeleteResponse,
  CustomCreateResponse,
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
   * @param {MCPCreateConfig} config - Server configuration
   * @param {MCPAuthOptions} [authOptions] - Authentication configuration options
   * @returns {Promise<MCPCreateMethodResponse>} Created server details with instance getter
   * 
   * @example
   * ```typescript
   * // Create a server with multiple toolkits
   * const mcpConfig = await composio.mcp.create("my-mcp-server", {
   *   toolkits: ["SUPABASE", "GMAIL"]
   * }, {
   *   managedAuthInMCP: true,
   *   authConfigId: ["auth_cfg_123"]
   * });
   * 
   * // Create a server with specific tools
   * const mcpConfig = await composio.mcp.create("my-tools-server", {
   *   tools: ["GMAIL_FETCH_EMAIL", "SUPABASE_QUERY"]
   * });
   * 
   * // Get MCP server instance for a user
   * const mcpServer = await mcpConfig.get(
   *   "user_123",
   *   ["conn_acc_1", "conn_acc_2"], // Optional connected account IDs
   *   {
   *     managedAuthInMCP: true,
   *     authConfigId: ["auth_cfg_123"]
   *   }
   * );
   * ```
   */
  async create(
    name: string,
    config: MCPCreateConfig,
    authOptions?: MCPAuthOptions
  ): Promise<MCPCreateMethodResponse> {
    // If there are multiple toolkits, we need to create a custom MCP server
    const isMultiApp = !!config.toolkits?.length;
    const response: McpCreateResponse | CustomCreateResponse = isMultiApp 
      ? await this.client.mcp.custom.create({
          name,
          toolkits: config.toolkits || [],
          custom_tools: config.tools || [],
          use_managed_auth: authOptions?.useManagedAuth || false,
          auth_config_ids: authOptions?.authConfigId || []
        })
      : await this.client.mcp.create({
          name,
          allowed_tools: config.tools || [],
          managed_auth_via_composio: authOptions?.useManagedAuth || false,
          auth_config_ids: [authOptions?.authConfigId || '']
        });

    // Add get method to response
    return {
      ...response,
      get: async ({ userId, connectedAccountIds }: { userId: string; connectedAccountIds?: string[] }, authOptions?: MCPAuthOptions) => {
        const options: MCPInstanceParams = {
          serverId: response.id,
          userId,
          connectedAccountIds,
          use_managed_auth: authOptions?.useManagedAuth || false,
          auth_config_ids: authOptions?.authConfigId || []
        };
        // add the api endpoint to generate the links
        // return this.client.mcp.getInstance(options);
      }
    };
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
   *   authConfigs: ['auth_123', 'auth_456']
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
    // Validate that at least one filter is provided
    if (!options.toolkits?.length && !options.authConfigs?.length && !options.name) {
      throw new Error('At least one filter (toolkits, authConfigs, or name) must be provided');
    }

    return this.client.mcp.list({
      page: options.page,
      limit: options.limit,
      toolkits: options.toolkits,
      auth_configs: options.authConfigs,
      name: options.name,
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
   * @param {MCPCreateConfig} config - Updated server configuration
   * @param {MCPAuthOptions} [authOptions] - Updated authentication options
   * @returns {Promise<McpUpdateResponse>} Updated server details
   * 
   * @example
   * ```typescript
   * const updatedServer = await composio.mcp.update(
   *   "server-uuid",
   *   "my-updated-server",
   *   {
   *     toolkits: ["SUPABASE", "GMAIL"],
   *     // OR tools: ["GMAIL_FETCH_EMAIL", "SUPABASE_QUERY"]
   *   },
   *   {
   *     managedAuthInMCP: true,
   *     authConfigId: ["auth_cfg_123"]
   *   }
   * );
   * ```
   */
  async update(
    id: string,
    name: string,
    config: MCPCreateConfig,
    authOptions?: MCPAuthOptions
  ): Promise<McpUpdateResponse> {
    return this.client.mcp.update(id, {
      name,
      toolkits: config.toolkits,
      tools: config.tools,
      use_managed_auth: authOptions?.useManagedAuth,
      auth_config_ids: authOptions?.authConfigId,
    });
  }
}