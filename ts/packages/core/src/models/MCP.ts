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
  MCPToolkitConfig,
  MCPAuthOptions,
  MCPGetServerParams,
  MCPToolkitConfigsArraySchema,
  MCPAuthOptionsSchema,
  MCPGetServerParamsSchema,
  ComposioCustomCreateResponseSchema,
  ComposioMcpListResponseSchema,
  McpRetrieveResponseSchema,
  ComposioMcpDeleteResponseSchema,
  ComposioMcpUpdateResponseSchema,
  McpUrlResponse,
  McpUrlResponseCamelCase,
  McpServerGetResponse,
  McpServerCreateResponse,
  ComposioGenerateURLResponseSchema,
  McpListResponse,
  McpRetrieveResponse,
  McpDeleteResponse,
  McpUpdateResponse,
  GenerateURLResponse,
  GenerateURLParamsSchema,
  GenerateURLParams,
  McpToolkitConnectionStatus,
  McpUserConnectionStatus,
  ConnectionStatus,
} from '../types/mcp.types';
import {
  CustomCreateResponse as CustomCreateResponseRaw,
  GenerateURLParams as GenerateURLParamsRaw,
} from '@composio/client/resources/mcp';
import { ValidationError } from '../errors/ValidationErrors';
import { BaseComposioProvider } from '../provider/BaseProvider';
import {
  transformMcpCreateResponse,
  transformMcpListResponse,
  transformMcpRetrieveResponse,
  transformMcpDeleteResponse,
  transformMcpUpdateResponse,
  transformMcpGenerateUrlResponse,
} from '../utils/transformers/mcp';
import { Toolkits } from './Toolkits';
import { ToolkitAuthFieldsResponse } from '../types/toolkit.types';
import { ConnectionRequest } from '../types/connectionRequest.types';

/**
 * MCP (Model Control Protocol) class
 * Handles MCP server operations
 */
export class MCP<T = McpServerGetResponse> {
  private client: ComposioClient;
  private provider?: BaseComposioProvider<unknown, unknown, unknown>;
  private toolkits: Toolkits;

  constructor(client: ComposioClient, provider?: BaseComposioProvider<unknown, unknown, unknown>) {
    this.client = client;
    this.provider = provider;
    this.toolkits = new Toolkits(client);
    telemetry.instrument(this);
  }

  /**
   * Validates toolkit configurations using Zod schema
   * @private
   * @param {MCPToolkitConfig[]} toolkitConfigs - Array of toolkit configurations to validate
   * @param {MCPAuthOptions} [authOptions] - Authentication options to validate
   * @throws {ValidationError} If validation fails
   */
  private validateInputs(toolkitConfigs: MCPToolkitConfig[], authOptions?: MCPAuthOptions): void {
    // Validate toolkit configurations
    const toolkitConfigsResult = MCPToolkitConfigsArraySchema.safeParse(toolkitConfigs);
    if (toolkitConfigsResult.error) {
      throw new ValidationError('Failed to parse toolkit configurations', {
        cause: toolkitConfigsResult.error,
      });
    }

    // Validate auth options if provided
    if (authOptions !== undefined) {
      const authOptionsResult = MCPAuthOptionsSchema.safeParse(authOptions);
      if (authOptionsResult.error) {
        throw new ValidationError('Failed to parse auth options', {
          cause: authOptionsResult.error,
        });
      }
    }
  }

  /**
   * Create a new MCP server
   * @param {Object} params - Parameters for creating the MCP server
   * @param {Array} params.authConfig - Array of auth configurations with id and allowed tools
   * @param {Object} params.options - Server creation options
   * @param {string} params.options.name - Unique name for the MCP server
   * @param {boolean} [params.options.isChatAuth] - Whether to use chat-based authentication
   * @returns {Promise<McpServerCreateResponse<T>>} Created server details with instance getter
   *
   * @example
   * ```typescript
   * const server = await composio.mcp.create({
   *   serverConfig: [
   *     {
   *       authConfigId: "ac_xyz",
   *       allowedTools: ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"]
   *     }
   *   ],
   *   options: {
   *     name: "personal-mcp-server",
   *     isChatAuth: true
   *   }
   * });
   *
   * // Use convenience method on response
   * const urls = await server.getServer({
   *   userId: "user123"
   * });
   * ```
   */
  async create({
    name,
    serverConfig,
    options,
  }: {
    name: string;
    serverConfig: Array<{
      authConfigId: string;
      allowedTools: string[];
    }>;
    options: {
      isChatAuth?: boolean;
    };
  }): Promise<McpServerCreateResponse<T>> {
    // Validate inputs using Zod schemas
    if (!serverConfig || serverConfig.length === 0) {
      throw new ValidationError('At least one auth config is required', {});
    }

    if (!name) {
      throw new ValidationError('Server name is required', {});
    }

    // Check if server with this name already exists
    try {
      await this.getByName(name);
      // If we reach here, server exists
      throw new ValidationError('MCP server with this name already exists', {
        meta: { serverName: name },
      });
    } catch (error) {
      // If error is not about server not found, re-throw it
      if (error instanceof ValidationError && !error.message.includes('not found')) {
        throw error;
      }
      // Server doesn't exist, we can proceed with creation
    }

    // Get toolkits from auth configs
    const authConfigDetails = await Promise.all(
      serverConfig.map(config => this.client.authConfigs.retrieve(config.authConfigId))
    );
    const toolkits = authConfigDetails.map(config => config.toolkit.slug);

    // Create a custom MCP server with the toolkit configurations
    let mcpServerCreatedResponse: CustomCreateResponseRaw;
    try {
      mcpServerCreatedResponse = await this.client.mcp.custom.create({
        name: name,
        toolkits: toolkits,
        custom_tools: serverConfig.flatMap(config => config.allowedTools),
        managed_auth_via_composio: options.isChatAuth || false,
        auth_config_ids: serverConfig.map(config => config.authConfigId),
      });
    } catch (error) {
      throw new ValidationError('Failed to create MCP server', {
        cause: error,
      });
    }

    // Validate the server creation response
    const serverResponseResult =
      ComposioCustomCreateResponseSchema.safeParse(mcpServerCreatedResponse);
    if (serverResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server creation response', {
        cause: serverResponseResult.error,
      });
    }

    // Transform the response to camelCase
    const camelCaseResponse = transformMcpCreateResponse(mcpServerCreatedResponse);

    // Return response with convenience getServer method
    return {
      ...camelCaseResponse,
      toolkits,
      getServer: async (params: MCPGetServerParams): Promise<T> => {
        // Delegate to the standalone getServer method
        return this.getServer({
          id: camelCaseResponse.id,
          userId: params.userId || Object.keys(params.connectedAccountIds || {})[0] || '',
          options: {
            isChatAuth: options.isChatAuth,
          },
        });
      },
    } as McpServerCreateResponse<T>;
  }

  /**
   * Get the connection status of a user for an MCP server
   *
   * Checks whether a user has the necessary connected accounts to use all toolkits
   * configured in the specified MCP server. Returns both overall connection status
   * and individual status for each toolkit.
   *
   * @param {Object} params - Parameters for checking connection status
   * @param {string} params.id - The UUID of the MCP server to check
   * @param {string} params.userId - The ID of the user to check connection status for
   * @returns {Promise<McpUserConnectionStatus>} Complete connection status including:
   *   - `type`: Overall status (CONNECTED if all toolkits are connected, DISCONNECTED otherwise)
   *   - `connected`: Boolean indicating if user can use the MCP server
   *   - `connectedToolkits`: Record mapping each toolkit name to its individual connection status
   *
   * @throws {ValidationError} When MCP server has no toolkits configured
   * @throws {ValidationError} When MCP server retrieval fails
   *
   * @example
   * ```typescript
   * // Check if user can access an MCP server with Gmail and Slack toolkits
   * const connectionStatus = await composio.mcp.getUserConnectionStatus({
   *   id: 'mcp-server-uuid',
   *   userId: 'user123'
   * });
   *
   * if (connectionStatus.connected) {
   *   console.log('User can access all required toolkits');
   *   // connectionStatus.type === ConnectionStatus.CONNECTED
   * } else {
   *   console.log('User is missing some toolkit connections');
   *   // Check individual toolkit statuses
   *   Object.entries(connectionStatus.connectedToolkits).forEach(([toolkit, status]) => {
   *     if (!status.connected) {
   *       console.log(`Missing connection for toolkit: ${toolkit}`);
   *     }
   *   });
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Example response when user has Gmail connected but missing Slack
   * {
   *   type: ConnectionStatus.DISCONNECTED,
   *   connected: false,
   *   connectedToolkits: {
   *     GMAIL: {
   *       type: ConnectionStatus.CONNECTED,
   *       connected: true,
   *       toolkit: 'GMAIL',
   *       connectedAccountId: 'conn_gmail_123'
   *     },
   *     SLACK: {
   *       type: ConnectionStatus.DISCONNECTED,
   *       connected: false,
   *       toolkit: 'SLACK'
   *     }
   *   }
   * }
   * ```
   */
  async getUserConnectionStatus({
    id,
    userId,
  }: {
    id: string;
    userId: string;
  }): Promise<McpUserConnectionStatus> {
    const serverDetails = await this.get(id);

    if (!serverDetails.toolkits || serverDetails.toolkits.length === 0) {
      throw new ValidationError('MCP server has no toolkits configured', {
        meta: { serverId: id },
      });
    }

    // @TODO(utkarsh-dixit): Add auth_config_ids support here
    const connectedAccounts = await this.client.connectedAccounts.list({
      user_ids: [userId],
      toolkit_slugs: serverDetails.toolkits.map(toolkit => toolkit.toLowerCase()),
      statuses: ['ACTIVE'],
    });

    const connectedAccountsByToolkit = new Map<string, string>();
    connectedAccounts.items?.forEach(account => {
      connectedAccountsByToolkit.set(account.toolkit.slug.toLowerCase(), account.id);
    });

    const connectedToolkits: Record<string, McpToolkitConnectionStatus> = {};
    let allToolkitsConnected = true;

    for (const toolkit of serverDetails.toolkits) {
      const connectedAccountId = connectedAccountsByToolkit.get(toolkit.toLowerCase());

      if (connectedAccountId) {
        connectedToolkits[toolkit] = {
          type: ConnectionStatus.CONNECTED,
          connected: true,
          toolkit,
          connectedAccountId,
        };
      } else {
        connectedToolkits[toolkit] = {
          type: ConnectionStatus.DISCONNECTED,
          connected: false,
          toolkit,
        };
        allToolkitsConnected = false;
      }
    }

    if (allToolkitsConnected) {
      return {
        type: ConnectionStatus.CONNECTED,
        connected: true,
        connectedToolkits,
      };
    } else {
      return {
        type: ConnectionStatus.DISCONNECTED,
        connected: false,
        connectedToolkits,
      };
    }
  }

  async getConnectionParams({
    id,
    toolkit,
  }: {
    id: string;
    toolkit: string;
  }): Promise<ToolkitAuthFieldsResponse> {
    const mcpServerDetails = await this.get(id);
    const authConfigs = mcpServerDetails.authConfigIds
      ? await Promise.all(
          mcpServerDetails.authConfigIds.map(id => this.client.authConfigs.retrieve(id))
        )
      : [];

    const authConfig = authConfigs.find(config => config.toolkit.slug === toolkit);
    if (!authConfig) {
      throw new ValidationError('Auth config not found', {
        meta: { serverId: id, toolkit },
      });
    }

    const connectionParams = await this.toolkits.getConnectedAccountInitiationFields(
      toolkit,
      authConfig.auth_scheme!
    );
    return connectionParams;
  }

  async authorize({
    id,
    userId,
    toolkit,
  }: {
    id: string;
    userId: string;
    toolkit: string;
  }): Promise<ConnectionRequest> {
    const mcpServerDetails = await this.get(id);
    const authConfigId = mcpServerDetails.authConfigIds?.[0];
    return this.toolkits.authorize(userId, toolkit, authConfigId);
  }

  /**
   * Get server URLs for an existing MCP server
   * @param {Object} params - Parameters for getting server URLs
   * @param {string} params.id - Server UUID
   * @param {string} params.userId - User ID to get server URLs for
   * @param {Object} [params.options] - Additional options for server configuration
   * @param {string[]} [params.options.limitTools] - Subset of tools to limit (from MCP config)
   * @param {boolean} [params.options.isChatAuth] - Whether to use chat-based authentication
   * @returns {Promise<T>} Transformed server URLs in provider-specific format
   *
   * @example
   * ```typescript
   * // Get URLs for an existing server with basic user ID
   * const urls = await composio.mcp.getServer({
   *   id: "mcp_xyz",
   *   userId: "hey@example.com"
   * });
   *
   * // Get URLs with additional options
   * const urls = await composio.mcp.getServer({
   *   id: "mcp_xyz",
   *   userId: "hey@example.com",
   *   options: {
   *     limitTools: ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"],
   *     isChatAuth: true
   *   }
   * });
   * ```
   */
  async getServer({
    id,
    userId,
    options,
  }: {
    id: string;
    userId: string;
    options?: {
      limitTools?: string[];
      isChatAuth?: boolean;
    };
  }): Promise<T> {
    // Get server details first
    const serverDetails = await this.get(id);

    // Validate userId is provided
    if (!userId) {
      throw new ValidationError('User ID is required', {});
    }

    // Extract toolkits from server details
    const toolkits = serverDetails.toolkits || [];

    const connectedAccountIds = (
      await Promise.all(
        toolkits.map(toolkit =>
          this.client.connectedAccounts
            .list({
              user_ids: [userId],
              toolkit_slugs: [toolkit],
              statuses: ['ACTIVE'],
            })
            .then(res => res.items?.[0]?.id)
        )
      )
    ).filter(Boolean);

    // Generate URL with error handling
    let data;
    try {
      data = await this.client.mcp.generate.url({
        user_ids: [userId],
        connected_account_ids: connectedAccountIds,
        mcp_server_id: id,
        managed_auth_by_composio:
          options?.isChatAuth ?? serverDetails.managedAuthViaComposio ?? false,
      });
    } catch (error) {
      throw new ValidationError('Failed to generate MCP server URL', {
        cause: error,
      });
    }

    // Validate the URL generation response
    const urlResponseResult = ComposioGenerateURLResponseSchema.safeParse(data);
    if (urlResponseResult.error) {
      throw new ValidationError('Failed to parse MCP URL generation response', {
        cause: urlResponseResult.error,
      });
    }

    // Transform to camelCase
    const camelCaseData = transformMcpGenerateUrlResponse(data);

    // Use the wrapMcpServerResponse method to transform the response
    return this.wrapMcpServerResponse(
      camelCaseData,
      serverDetails.name,
      connectedAccountIds,
      [userId],
      toolkits
    );
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
    // List MCP servers with error handling
    let listResponse;
    try {
      listResponse = await this.client.mcp.list({
        page_no: options.page || 1,
        limit: options.limit || 10,
        toolkits: options?.toolkits?.join(',') || undefined,
        auth_config_ids: options?.authConfigs?.join(',') || undefined,
        name: options?.name,
      });
    } catch (error) {
      throw new ValidationError('Failed to list MCP servers', {
        cause: error,
      });
    }

    // Validate the list response
    const listResponseResult = ComposioMcpListResponseSchema.safeParse(listResponse);
    if (listResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server list response', {
        cause: listResponseResult.error,
      });
    }

    // Transform the response to camelCase
    return transformMcpListResponse(listResponse);
  }

  /**
   * Get details of a specific MCP server
   * @param {string} id - Server UUID
   * @returns {Promise<McpRetrieveResponse>} Server details
   *
   * @example
   * ```typescript
   * const serverDetails = await composio.mcp.get('server-uuid');
   * ```
   */
  async get(id: string): Promise<McpRetrieveResponse> {
    // Retrieve MCP server with error handling
    let retrieveResponse;
    try {
      retrieveResponse = await this.client.mcp.retrieve(id);
    } catch (error) {
      throw new ValidationError('Failed to retrieve MCP server', {
        cause: error,
      });
    }

    // Validate the retrieve response
    const retrieveResponseResult = McpRetrieveResponseSchema.safeParse(retrieveResponse);
    if (retrieveResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server retrieve response', {
        cause: retrieveResponseResult.error,
      });
    }

    // Transform the response to camelCase
    return transformMcpRetrieveResponse(retrieveResponse);
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
    // Delete MCP server with error handling
    let deleteResponse;
    try {
      deleteResponse = await this.client.mcp.delete(id);
    } catch (error) {
      throw new ValidationError('Failed to delete MCP server', {
        cause: error,
      });
    }

    // Validate the delete response
    const deleteResponseResult = ComposioMcpDeleteResponseSchema.safeParse(deleteResponse);
    if (deleteResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server delete response', {
        cause: deleteResponseResult.error,
      });
    }

    // Transform the response to camelCase
    return transformMcpDeleteResponse(deleteResponse);
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
   *     useComposioManagedAuth: true,
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
    // Validate inputs using Zod schemas
    this.validateInputs(toolkitConfigs, authOptions);

    const toolkits = toolkitConfigs.map(config => config.toolkit);

    // Update MCP server with error handling
    let updateResponse;
    try {
      updateResponse = await this.client.mcp.update(id, {
        name,
        toolkits: toolkits,
        allowed_tools: toolkitConfigs.flatMap(config => config.allowedTools),
        managed_auth_via_composio: authOptions?.useComposioManagedAuth || false,
      });
    } catch (error) {
      throw new ValidationError('Failed to update MCP server', {
        cause: error,
      });
    }

    // Validate the update response
    const updateResponseResult = ComposioMcpUpdateResponseSchema.safeParse(updateResponse);
    if (updateResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server update response', {
        cause: updateResponseResult.error,
      });
    }

    // Transform the response to camelCase
    return transformMcpUpdateResponse(updateResponse);
  }

  /**
   * Generate URL for an MCP server
   * @param {GenerateURLParams} params - Parameters for URL generation
   * @returns {Promise<GenerateURLResponse>} Generated URL response
   *
   * @example
   * ```typescript
   * const urlResponse = await composio.mcp.generateUrl({
   *   userIds: ['user123'],
   *   connectedAccountIds: ['account456'],
   *   mcpServerId: 'server-uuid',
   *   composioManagedAuth: true
   * });
   * ```
   */
  async generateUrl(params: GenerateURLParams): Promise<GenerateURLResponse> {
    // Validate parameters using Zod schema (snake_case)
    const paramsResult = GenerateURLParamsSchema.safeParse(params);
    if (paramsResult.error) {
      throw new ValidationError('Failed to parse generateUrl parameters', {
        cause: paramsResult.error,
      });
    }

    // No transformation needed - params are already in snake_case
    let urlResponse;
    try {
      urlResponse = await this.client.mcp.generate.url({
        mcp_server_id: params.mcpServerId,
        user_ids: params.userIds,
        connected_account_ids: params.connectedAccountIds,
        managed_auth_by_composio: params.composioManagedAuth,
      });
    } catch (error) {
      throw new ValidationError('Failed to generate MCP URL', {
        cause: error,
      });
    }

    // Validate the response
    const responseResult = ComposioGenerateURLResponseSchema.safeParse(urlResponse);
    if (responseResult.error) {
      throw new ValidationError('Failed to parse MCP URL generation response', {
        cause: responseResult.error,
      });
    }

    // Transform the response to camelCase
    return transformMcpGenerateUrlResponse(urlResponse);
  }

  /**
   * Transform MCP URL response into the appropriate format.
   * If the provider has a custom transform method, use it.
   * Otherwise, use the default transformation.
   *
   * @param data - The MCP URL response data (in camelCase)
   * @param serverName - Name of the MCP server

   * @returns Transformed response in appropriate format
   */
  private wrapMcpServerResponse(
    data: McpUrlResponseCamelCase,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): T {
    // Check if provider has a custom transform method
    if (this.provider && typeof this.provider.wrapMcpServerResponse === 'function') {
      // Convert to array of name and url based on connected accounts or user ids
      let snakeCaseData: McpUrlResponse;

      if (data.connectedAccountUrls?.length) {
        snakeCaseData = data.connectedAccountUrls.map((url, index) => ({
          name: serverName + '-' + connectedAccountIds?.[index],
          url: url,
        }));
      } else if (data.userIdsUrl?.length) {
        snakeCaseData = data.userIdsUrl.map((url, index) => ({
          name: serverName + '-' + userIds?.[index],
          url: url,
        }));
      } else {
        snakeCaseData = [
          {
            name: serverName,
            url: data.mcpUrl,
          },
        ];
      }

      const transformed = this.provider.wrapMcpServerResponse(snakeCaseData);
      return transformed as T;
    }

    // Default transformation
    if (connectedAccountIds?.length && data.connectedAccountUrls) {
      return data.connectedAccountUrls.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${connectedAccountIds[index]}`,
        toolkit: toolkits?.[index],
      })) as T;
    } else if (userIds?.length && data.userIdsUrl) {
      return data.userIdsUrl.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${userIds[index]}`,
        toolkit: toolkits?.[index],
      })) as T;
    }
    return {
      url: new URL(data.mcpUrl),
      name: serverName,
    } as T;
  }

  /**
   * Get details of a specific MCP server by name
   * @param {string} name - Server name
   * @returns {Promise<McpRetrieveResponse>} Server details
   * @throws {ValidationError} If no server found with the given name
   * @throws {ValidationError} If multiple servers found with the same name
   *
   * @example
   * ```typescript
   * const serverDetails = await composio.mcp.getByName('my-gmail-server');
   * ```
   */
  async getByName(name: string): Promise<McpRetrieveResponse> {
    if (!name) {
      throw new ValidationError('Server name is required', {});
    }

    // List MCP servers filtered by name
    let listResponse;
    try {
      listResponse = await this.client.mcp.list({
        name: name,
        limit: 10,
      });
    } catch (error) {
      throw new ValidationError('Failed to search MCP servers by name', {
        cause: error,
      });
    }

    // Validate the list response
    const listResponseResult = ComposioMcpListResponseSchema.safeParse(listResponse);
    if (listResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server list response', {
        cause: listResponseResult.error,
      });
    }

    const servers = listResponse.items || [];

    if (servers.length === 0) {
      throw new ValidationError(`MCP server with name '${name}' not found`, {
        meta: { serverName: name },
      });
    }

    // Get the full server details using the server ID
    return this.get(servers[0].id);
  }
}
