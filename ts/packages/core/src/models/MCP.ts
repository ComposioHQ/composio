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
  CustomCreateResponseSchema,
  GenerateURLResponseSchema,
  GenerateURLParamsSnakeCaseSchema,
  McpListResponseSchema,
  McpRetrieveResponseSchema,
  McpDeleteResponseSchema,
  McpUpdateResponseSchema,
  McpUrlResponse,
  McpUrlResponseCamelCase,
  McpServerGetResponse,
  McpServerCreateResponse,
} from '../types/mcp.types';
import { CustomCreateResponse, GenerateURLParams } from '@composio/client/resources/mcp';
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

/**
 * MCP (Model Control Protocol) class
 * Handles MCP server operations
 */
export class MCP<T = McpServerGetResponse> {
  private client: ComposioClient;
  private provider?: BaseComposioProvider<unknown, unknown, unknown>;

  constructor(client: ComposioClient, provider?: BaseComposioProvider<unknown, unknown, unknown>) {
    this.client = client;
    this.provider = provider;
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
   * @param {string} name - Unique name for the MCP server
   * @param {MCPToolkitConfig[]} toolkitConfigs - Array of toolkit configurations
   * @param {MCPAuthOptions} [authOptions] - Authentication configuration options
   * @returns {Promise<McpServerCreateResponse<T>>} Created server details with instance getter
   *
   * @example
   * ```typescript
   * const server = await composio.mcp.create(
   *   "personal-mcp-server",
   *   [
   *     {
   *       toolkit: "GMAIL",
   *       authConfigId: "ac_sdhkjfhjksdk",
   *       allowedTools: ["GMAIL_FETCH_EMAILS"],
   *     },
   *   ],
   *   { useComposioManagedAuth: true },
   * );
   *
   * // Option 1: Use convenience method on response
   * const urls = await server.getServer({
   *   connectedAccountIds: { gmail: "account_id" }
   * });
   *
   * // Option 2: Use standalone method later
   * const urlsLater = await composio.mcp.getServer(server.id, {
   *   connectedAccountIds: { gmail: "account_id" }
   * });
   * ```
   */
  async create(
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<McpServerCreateResponse<T>> {
    // Validate inputs using Zod schemas
    this.validateInputs(toolkitConfigs, authOptions);

    const toolkits = toolkitConfigs.map(config => config.toolkit);

    // Create a custom MCP server with the toolkit configurations
    let mcpServerCreatedResponse: CustomCreateResponse;
    try {
      mcpServerCreatedResponse = await this.client.mcp.custom.create({
        name,
        toolkits: toolkits,
        custom_tools: toolkitConfigs.flatMap(config => config.allowedTools),
        managed_auth_via_composio: authOptions?.useComposioManagedAuth || false,
        auth_config_ids: toolkitConfigs.map(config => config.authConfigId),
      });
    } catch (error) {
      throw new ValidationError('Failed to create MCP server', {
        cause: error,
      });
    }

    // Validate the server creation response
    const serverResponseResult = CustomCreateResponseSchema.safeParse(mcpServerCreatedResponse);
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
        return this.getServer(camelCaseResponse.id, params, authOptions);
      },
    } as McpServerCreateResponse<T>;
  }

  /**
   * Get server URLs for an existing MCP server
   * @param {string} id - Server UUID
   * @param {MCPGetServerParams} params - Parameters for getting server URLs
   * @param {MCPAuthOptions} [authOptions] - Authentication options (optional, will use server's default if not provided)
   * @returns {Promise<T>} Transformed server URLs in provider-specific format
   *
   * @example
   * ```typescript
   * // Get URLs for an existing server
   * const urls = await composio.mcp.getServer("server-id", {
   *   connectedAccountIds: {
   *     gmail: "connected_account_id"
   *   }
   * });
   * ```
   */
  async getServer(
    id: string,
    params: MCPGetServerParams,
    authOptions?: MCPAuthOptions
  ): Promise<T> {
    // Get server details first
    const serverDetails = await this.get(id);

    // Validate params using Zod schema
    const paramsResult = MCPGetServerParamsSchema.safeParse(params);
    if (paramsResult.error) {
      throw new ValidationError('Failed to parse get server parameters', {
        cause: paramsResult.error,
      });
    }

    // Extract toolkits from server details
    const toolkits = serverDetails.toolkits || [];

    // If connected_account_ids is provided, verify toolkit names
    if (paramsResult.data.connectedAccountIds) {
      const providedToolkits = Object.keys(paramsResult.data.connectedAccountIds);
      const invalidToolkits = providedToolkits.filter(toolkit => !toolkits.includes(toolkit));
      if (invalidToolkits.length > 0) {
        throw new ValidationError(
          `Invalid toolkits provided: ${invalidToolkits.join(', ')}. Available toolkits are: ${toolkits.join(', ')}`,
          {}
        );
      }
    }

    // Generate URL with error handling
    let data;
    try {
      data = await this.client.mcp.generate.url({
        user_ids: paramsResult.data.userId ? [paramsResult.data.userId] : [],
        connected_account_ids: paramsResult.data.connectedAccountIds
          ? Object.values(paramsResult.data.connectedAccountIds)
          : [],
        mcp_server_id: id,
        managed_auth_by_composio:
          authOptions?.useComposioManagedAuth ?? serverDetails.managedAuthViaComposio ?? false,
      });
    } catch (error) {
      throw new ValidationError('Failed to generate MCP server URL', {
        cause: error,
      });
    }

    // Validate the URL generation response
    const urlResponseResult = GenerateURLResponseSchema.safeParse(data);
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
      paramsResult.data.connectedAccountIds
        ? Object.values(paramsResult.data.connectedAccountIds)
        : undefined,
      paramsResult.data.userId ? [paramsResult.data.userId] : undefined,
      paramsResult.data.connectedAccountIds
        ? Object.keys(paramsResult.data.connectedAccountIds)
        : undefined
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
  }): Promise<ReturnType<typeof transformMcpListResponse>> {
    // List MCP servers with error handling
    let listResponse;
    try {
      listResponse = await this.client.mcp.list({
        page_no: options.page || 1,
        limit: options.limit || 10,
        toolkits: options?.toolkits?.join(',') || '',
        auth_config_ids: options?.authConfigs?.join(',') || '',
        name: options?.name,
      });
    } catch (error) {
      throw new ValidationError('Failed to list MCP servers', {
        cause: error,
      });
    }

    // Validate the list response
    const listResponseResult = McpListResponseSchema.safeParse(listResponse);
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
   * @returns {Promise<ReturnType<typeof transformMcpRetrieveResponse>>} Server details
   *
   * @example
   * ```typescript
   * const serverDetails = await composio.mcp.get('server-uuid');
   * ```
   */
  async get(id: string): Promise<ReturnType<typeof transformMcpRetrieveResponse>> {
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
   * @returns {Promise<ReturnType<typeof transformMcpDeleteResponse>>} Deletion response
   *
   * @example
   * ```typescript
   * const result = await composio.mcp.delete('server-uuid');
   * ```
   */
  async delete(id: string): Promise<ReturnType<typeof transformMcpDeleteResponse>> {
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
    const deleteResponseResult = McpDeleteResponseSchema.safeParse(deleteResponse);
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
   * @returns {Promise<ReturnType<typeof transformMcpUpdateResponse>>} Updated server details
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
  ): Promise<ReturnType<typeof transformMcpUpdateResponse>> {
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
    const updateResponseResult = McpUpdateResponseSchema.safeParse(updateResponse);
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
   * @returns {Promise<ReturnType<typeof transformMcpGenerateUrlResponse>>} Generated URL response
   *
   * @example
   * ```typescript
   * const urlResponse = await composio.mcp.generateUrl({
   *   user_ids: ['user123'],
   *   connected_account_ids: ['account456'],
   *   mcp_server_id: 'server-uuid',
   *   managed_auth_by_composio: true
   * });
   * ```
   */
  async generateUrl(
    params: GenerateURLParams
  ): Promise<ReturnType<typeof transformMcpGenerateUrlResponse>> {
    // Validate parameters using Zod schema (snake_case)
    const paramsResult = GenerateURLParamsSnakeCaseSchema.safeParse(params);
    if (paramsResult.error) {
      throw new ValidationError('Failed to parse generateUrl parameters', {
        cause: paramsResult.error,
      });
    }

    // No transformation needed - params are already in snake_case
    let urlResponse;
    try {
      urlResponse = await this.client.mcp.generate.url(params);
    } catch (error) {
      throw new ValidationError('Failed to generate MCP URL', {
        cause: error,
      });
    }

    // Validate the response
    const responseResult = GenerateURLResponseSchema.safeParse(urlResponse);
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
   * @param connectedAccountIds - Optional array of connected account IDs
   * @param userIds - Optional array of user IDs
   * @param toolkits - Optional array of toolkit names
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
      // Convert to snake_case for backward compatibility with providers
      const snakeCaseData: McpUrlResponse = {
        mcp_url: data.mcpUrl,
        ...(data.connectedAccountUrls && { connected_account_urls: data.connectedAccountUrls }),
        ...(data.userIdsUrl && { user_ids_url: data.userIdsUrl }),
      };

      let serverNames: string[] = [];
      if (!connectedAccountIds?.length && !userIds?.length) {
        serverNames = [serverName];
      } else {
        if (connectedAccountIds?.length) {
          serverNames = connectedAccountIds.map(
            (id, index) => `${serverName}-${connectedAccountIds[index]}`
          );
        } else if (userIds?.length) {
          serverNames = userIds.map((id, index) => `${serverName}-${userIds[index]}`);
        }
      }

      const transformed = this.provider.wrapMcpServerResponse(snakeCaseData, serverNames);
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
}
