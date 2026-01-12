import { Composio as ComposioClient } from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {
  MCPConfigCreationParams,
  MCPConfigCreationParamsSchema,
  MCPConfigCreateResponse,
  MCPConfigResponseSchema,
  MCPServerInstance,
  MCPGetInstanceParams,
  MCPGetInstanceParamsSchema,
  MCPListResponse,
  MCPListParams,
  MCPListParamsSchema,
  MCPListResponseSchema,
  MCPItemSchema,
  MCPItem,
  MCPUpdateParams,
  MCPUpdateParamsSchema,
} from '../types/mcp.experimental.types';
import { MCPServerInstanceSchema } from '../types/mcp.experimental.types';
import { ValidationError } from '../errors/ValidationErrors';
import { transform } from '../utils/transform';
import { McpUpdateResponse } from '@composio/client/resources.js';
import { McpRetrieveResponse } from '@composio/client/resources';

function transformMCPItemResponse(response: McpUpdateResponse | McpRetrieveResponse): MCPItem {
  return transform(response)
    .with(MCPItemSchema)
    .using(raw => ({
      name: raw.name,
      allowedTools: raw.allowed_tools,
      id: raw.id,
      authConfigIds: raw.auth_config_ids,
      commands: raw.commands,
      MCPUrl: raw.mcp_url,
      toolkitIcons: raw.toolkit_icons,
      serverInstanceCount: raw.server_instance_count,
      toolkits: raw.toolkits,
    }));
}
/**
 * MCP (Model Control Protocol) class
 * Handles MCP server operations.
 * When `config.experimental.mcp` is enabled, this class augments the features of `composio.mcp`.
 */
export class MCP {
  client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'MCP');
  }

  /**
   * Create a new MCP configuration.
   * @param {Object} params - Parameters for creating the MCP configuration
   * @param {Array} params.authConfig - Array of auth configurations with id and allowed tools
   * @param {Object} params.options - Configuration options
   * @param {string} params.options.name - Unique name for the MCP configuration
   * @param {boolean} [params.options.manuallyManageConnections] - Whether to use chat-based authentication or manually connect accounts
   * @returns {Promise<McpServerCreateResponse<T>>} Created server details with instance getter
   *
   * @example
   * ```typescript
   * const server = await composio.mcpConfig.create("personal-mcp-server", {
   *   toolkits: ["github", "slack"],
   *   allowedTools: ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"],
   *   manuallyManageConnections: false
   *  }
   * });
   *
   * const server = await composio.mcpConfig.create("personal-mcp-server", {
   *   toolkits: [{ toolkit: "gmail", authConfigId: "ac_243434343" }],
   *   allowedTools: ["GMAIL_FETCH_EMAILS"],
   *   manuallyManageConnections: false
   *  }
   * });
   * ```
   */
  async create(name: string, mcpConfig: MCPConfigCreationParams): Promise<MCPConfigCreateResponse> {
    const config = MCPConfigCreationParamsSchema.safeParse(mcpConfig);
    if (config.error) {
      throw new ValidationError('Invalid parameters passed to create mcp config', {
        cause: config.error,
      });
    }

    const toolkits: string[] = [];
    const auth_config_ids: string[] = [];
    const custom_tools: string[] = config.data.allowedTools ?? [];

    // extract all the toolkits, authconfigs, and allowed tools to separate slugs
    config.data.toolkits.forEach(toolkit => {
      if (typeof toolkit === 'string') {
        toolkits.push(toolkit);
      } else if (toolkit.toolkit) {
        toolkits.push(toolkit.toolkit);
      } else if (toolkit.authConfigId) {
        auth_config_ids.push(toolkit.authConfigId);
      }
    });

    const server = await this.client.mcp.custom.create({
      name,
      toolkits,
      auth_config_ids,
      custom_tools,
      // if manually manage account is set to true, disable composio account management tools
      managed_auth_via_composio: config.data.manuallyManageConnections ? false : true,
    });

    const camelCaseServer = transform(server)
      .with(MCPConfigResponseSchema)
      .using(raw => ({
        name: raw.name,
        allowedTools: raw.allowed_tools,
        id: raw.id,
        authConfigIds: raw.auth_config_ids,
        commands: raw.commands,
        MCPUrl: raw.mcp_url,
      }));

    return {
      ...camelCaseServer,
      generate: async (userId: string): Promise<MCPServerInstance> => {
        return await this.generate(userId, server.id, {
          manuallyManageConnections: config.data.manuallyManageConnections,
        });
      },
    };
  }

  /**
   * List the MCP servers with optional filtering and pagination
   * @param {Object} options - Filtering and pagination options
   * @param {number} [options.page=1] - Page number for pagination (1-based)
   * @param {number} [options.limit=10] - Maximum number of items to return per page
   * @param {string[]} [options.toolkits=[]] - Array of toolkit names to filter by
   * @param {string[]} [options.authConfigs=[]] - Array of auth configuration IDs to filter by
   * @param {string} [options.name] - Filter by MCP server name (partial match)
   * @returns {Promise<MCPListResponse>} Paginated list of MCP servers with metadata
   *
   * @example
   * ```typescript
   * // List all MCP servers
   * const allServers = await composio.experimental.mcp.list({});
   *
   * // List with pagination
   * const pagedServers = await composio.experimental.mcp.list({
   *   page: 2,
   *   limit: 5
   * });
   *
   * // Filter by toolkit
   * const githubServers = await composio.experimental.mcp.list({
   *   toolkits: ['github', 'slack']
   * });
   *
   * // Filter by name
   * const namedServers = await composio.experimental.mcp.list({
   *   name: 'personal'
   * });
   * ```
   */
  async list(options: MCPListParams): Promise<MCPListResponse> {
    const { data: params, error } = MCPListParamsSchema.safeParse(options);
    if (error) {
      throw new ValidationError('Failed to validate list options', {
        cause: error,
      });
    }

    const listResponse = await this.client.mcp.list({
      page_no: params.page,
      limit: params.limit,
      toolkits: params.toolkits?.length > 0 ? params.toolkits.join(',') : undefined,
      auth_config_ids: params.authConfigs?.length > 0 ? params.authConfigs.join(',') : undefined,
      name: params.name,
    });

    const transformedListResponse = transform(listResponse)
      .with(MCPListResponseSchema)
      .using(raw => ({
        currentPage: raw.current_page,
        totalPages: raw.total_pages,
        items: raw.items.map(item => ({
          name: item.name,
          allowedTools: item.allowed_tools,
          id: item.id,
          authConfigIds: item.auth_config_ids,
          commands: item.commands,
          MCPUrl: item.mcp_url,
          toolkitIcons: item.toolkit_icons,
          serverInstanceCount: item.server_instance_count,
          toolkits: item.toolkits,
        })),
      }));

    return transformedListResponse;
  }

  /**
   * Retrieve detailed information about a specific MCP server by its ID
   * @param {string} serverId - The unique identifier of the MCP server to retrieve
   * @returns {Promise<MCPItem>} Complete MCP server details including configuration, tools, and metadata
   *
   * @example
   * ```typescript
   * // Get a specific MCP server by ID
   * const server = await composio.experimental.mcp.get("mcp_12345");
   *
   * console.log(server.name); // "My Personal MCP Server"
   * console.log(server.allowedTools); // ["GITHUB_CREATE_ISSUE", "SLACK_SEND_MESSAGE"]
   * console.log(server.toolkits); // ["github", "slack"]
   * console.log(server.serverInstanceCount); // 3
   *
   * // Access setup commands for different clients
   * console.log(server.commands.claude); // Claude setup command
   * console.log(server.commands.cursor); // Cursor setup command
   * console.log(server.commands.windsurf); // Windsurf setup command
   *
   * // Use the MCP URL for direct connections
   * const mcpUrl = server.MCPUrl;
   * ```
   *
   * @throws {ValidationError} When the server ID is invalid or server not found
   */
  async get(serverId: string): Promise<MCPItem> {
    const response = await this.client.mcp.retrieve(serverId);
    return transformMCPItemResponse(response);
  }

  /**
   * Delete an MCP server configuration permanently
   * @param {string} serverId - The unique identifier of the MCP server to delete
   * @returns {Promise<{id: string; deleted: boolean}>} Confirmation object with server ID and deletion status
   *
   * @example
   * ```typescript
   * // Delete an MCP server by ID
   * const result = await composio.experimental.mcp.delete("mcp_12345");
   *
   * if (result.deleted) {
   *   console.log(`Server ${result.id} has been successfully deleted`);
   * } else {
   *   console.log(`Failed to delete server ${result.id}`);
   * }
   *
   * // Example with error handling
   * try {
   *   const result = await composio.experimental.mcp.delete("mcp_12345");
   *   console.log("Deletion successful:", result);
   * } catch (error) {
   *   console.error("Failed to delete MCP server:", error.message);
   * }
   *
   * // Delete and verify from list
   * await composio.experimental.mcp.delete("mcp_12345");
   * const servers = await composio.experimental.mcp.list({});
   * const serverExists = servers.items.some(server => server.id === "mcp_12345");
   * console.log("Server still exists:", serverExists); // Should be false
   * ```
   *
   * @throws {ValidationError} When the server ID is invalid or server not found
   * @throws {Error} When the server cannot be deleted due to active connections or other constraints
   *
   * @warning This operation is irreversible. Once deleted, the MCP server configuration and all its associated data will be permanently removed.
   */
  async delete(serverId: string): Promise<{ id: string; deleted: boolean }> {
    return await this.client.mcp.delete(serverId);
  }

  /**
   * Update an existing MCP server configuration with new settings
   * @param {string} serverId - The unique identifier of the MCP server to update
   * @param {Object} config - Update configuration parameters
   * @param {string} [config.name] - New name for the MCP server
   * @param {Array} [config.toolkits] - Updated toolkit configurations
   * @param {string} [config.toolkits[].toolkit] - Toolkit identifier (e.g., "github", "slack")
   * @param {string} [config.toolkits[].authConfigId] - Auth configuration ID for the toolkit
   * @param {string[]} [config.toolkits[].allowedTools] - Specific tools to enable for this toolkit
   * @param {boolean} [config.manuallyManageConnections] - Whether to manually manage account connections
   * @returns {Promise<MCPItem>} Updated MCP server configuration with all details
   *
   * @example
   * ```typescript
   * // Update server name only
   * const updatedServer = await composio.experimental.mcp.update("mcp_12345", {
   *   name: "My Updated MCP Server"
   * });
   *
   * // Update toolkits and tools
   * const serverWithNewTools = await composio.experimental.mcp.update("mcp_12345", {
   *   toolkits: [
   *     {
   *       toolkit: "github",
   *       authConfigId: "auth_abc123",
   *       allowedTools: ["GITHUB_CREATE_ISSUE", "GITHUB_LIST_REPOS"]
   *     },
   *     {
   *       toolkit: "slack",
   *       authConfigId: "auth_xyz789",
   *       allowedTools: ["SLACK_SEND_MESSAGE", "SLACK_LIST_CHANNELS"]
   *     }
   *   ]
   * });
   *
   * // Update connection management setting
   * const serverWithManualAuth = await composio.experimental.mcp.update("mcp_12345", {
   *   name: "Manual Auth Server",
   *   manuallyManageConnections: true
   * });
   *
   * // Complete update example
   * const fullyUpdatedServer = await composio.experimental.mcp.update("mcp_12345", {
   *   name: "Production MCP Server",
   *   toolkits: [
   *     {
   *       toolkit: "gmail",
   *       authConfigId: "auth_gmail_prod",
   *     }
   *   ],
   *   allowedTools: ["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS"]
   *   manuallyManageConnections: false
   * });
   *
   * console.log("Updated server:", fullyUpdatedServer.name);
   * console.log("New tools:", fullyUpdatedServer.allowedTools);
   * ```
   *
   * @throws {ValidationError} When the update parameters are invalid or malformed
   * @throws {Error} When the server ID doesn't exist or update fails
   *
   * @note Only provided fields will be updated. Omitted fields will retain their current values.
   * @note When updating toolkits, the entire toolkit configuration is replaced, not merged.
   */
  async update(serverId: string, config: MCPUpdateParams): Promise<MCPItem> {
    const { data: params, error } = MCPUpdateParamsSchema.safeParse(config);
    if (error) {
      throw new ValidationError('Failed to validate update params', {
        cause: error,
      });
    }

    const toolkits: string[] = [];
    const auth_config_ids: string[] = [];
    const custom_tools: string[] | undefined = params.allowedTools ?? undefined;

    // extract all the toolkits, authconfigs, and allowed tools to separate slugs
    params.toolkits?.forEach(toolkit => {
      if (typeof toolkit === 'string') {
        toolkits.push(toolkit);
      } else if (toolkit.toolkit) {
        toolkits.push(toolkit.toolkit);
      } else if (toolkit.authConfigId) {
        auth_config_ids.push(toolkit.authConfigId);
      }
    });
    const response = await this.client.mcp.update(serverId, {
      ...{ name: params.name ?? undefined },
      ...(params.toolkits
        ? {
            custom_tools: custom_tools,
            toolkits: toolkits,
            auth_config_ids: auth_config_ids,
          }
        : {}),
      ...{ managed_auth_via_composio: params.manuallyManageConnections ?? undefined },
    });
    return transformMCPItemResponse(response);
  }

  /**
   * Get server URLs for an existing MCP server.
   * The response is wrapped according to the provider's specifications.
   *
   * @example
   * ```typescript
   * import { Composio } from "@composio/code";
   *
   * const composio = new Composio();
   * const mcp = await composio.experimental.mcp.generate("default", "<mcp_config_id>");
   * ```
   *
   * @param userId {string} external user id from your database for whom you want the server for
   * @param mcpConfigId {string} config id of the MCPConfig for which you want to create a server for
   * @param options {object} additional options
   * @param options.isChatAuth {boolean} Authenticate the users via chat when they use the MCP Server
   */
  async generate(
    userId: string,
    mcpConfigId: string,
    options?: MCPGetInstanceParams
  ): Promise<MCPServerInstance> {
    const server = await this.client.mcp.retrieve(mcpConfigId);
    const params = MCPGetInstanceParamsSchema.safeParse(
      options ?? { manuallyManageConnections: false }
    );
    if (params.error) {
      throw new ValidationError('Invalid params passed for Get Instance Params', {
        cause: params.error,
      });
    }

    const urlResponse = await this.client.mcp.generate.url({
      mcp_server_id: mcpConfigId,
      user_ids: [userId],
      managed_auth_by_composio: options?.manuallyManageConnections ? false : true,
    });

    const userIdsURL = urlResponse.user_ids_url[0];
    const serverInstance = MCPServerInstanceSchema.safeParse({
      id: server.id,
      name: server.name,
      type: 'streamable_http' as const,
      url: userIdsURL,
      userId: userId,
      allowedTools: server.allowed_tools,
      authConfigs: server.auth_config_ids,
    });

    if (serverInstance.error) {
      throw new ValidationError('Failed to parse MCP server instance', {
        cause: serverInstance.error,
      });
    }

    return serverInstance.data;
  }
}
