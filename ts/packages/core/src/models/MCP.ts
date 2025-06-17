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
  MCPGetServerParams,
  MCPToolkitConfigsArraySchema,
  MCPAuthOptionsSchema,
  MCPGetServerParamsSchema,
  CustomCreateResponseSchema,
  GenerateURLResponseSchema,
  McpListResponseSchema,
  McpRetrieveResponseSchema,
  McpDeleteResponseSchema,
  McpUpdateResponseSchema,
} from '../types/mcp.types';
import {
  McpCreateResponse,
  McpListResponse,
  McpUpdateResponse,
  McpDeleteResponse,
  CustomCreateResponse,
  GenerateURLResponse,
  GenerateURLParams,
} from '@composio/client/resources/mcp';
import { ValidationError } from '../errors/ValidationErrors';

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
   *   { useComposioManagedAuth: true },
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

    // Add getServer method to response
    return {
      ...mcpServerCreatedResponse,
      toolkits,
      getServer: async (params: MCPGetServerParams): Promise<GenerateURLResponse> => {
        // Validate params using Zod schema
        const paramsResult = MCPGetServerParamsSchema.safeParse(params);
        if (paramsResult.error) {
          throw new ValidationError('Failed to parse get server parameters', {
            cause: paramsResult.error,
          });
        }

        // If connected_account_ids is provided, verify toolkit names
        if (paramsResult.data.connectedAccountIds) {
          const providedToolkits = Object.keys(paramsResult.data.connectedAccountIds);
          const invalidToolkits = providedToolkits.filter(toolkit => !toolkits.includes(toolkit));
          if (invalidToolkits.length > 0) {
            throw new Error(
              `Invalid toolkits provided: ${invalidToolkits.join(', ')}. Available toolkits are: ${toolkits.join(', ')}`
            );
          }
        }

        const generateURLParams = {
          mcp_server_id: mcpServerCreatedResponse.id,
          user_ids: paramsResult.data.userId ? [paramsResult.data.userId] : [],
          connected_account_ids: paramsResult.data.connectedAccountIds
            ? Object.values(paramsResult.data.connectedAccountIds)
            : [],
          managed_auth_by_composio: authOptions?.useComposioManagedAuth || false,
        };

        // Generate URL with error handling
        let urlResponse;
        try {
          urlResponse = await this.client.mcp.generate.url(generateURLParams);
        } catch (error) {
          throw new ValidationError('Failed to generate MCP server URL', {
            cause: error,
          });
        }

        // Validate the URL generation response
        const urlResponseResult = GenerateURLResponseSchema.safeParse(urlResponse);
        if (urlResponseResult.error) {
          throw new ValidationError('Failed to parse MCP URL generation response', {
            cause: urlResponseResult.error,
          });
        }

        return urlResponse;
      },
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

    return listResponse;
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

    return retrieveResponse;
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
    const deleteResponseResult = McpDeleteResponseSchema.safeParse(deleteResponse);
    if (deleteResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server delete response', {
        cause: deleteResponseResult.error,
      });
    }

    return deleteResponse;
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
    const updateResponseResult = McpUpdateResponseSchema.safeParse(updateResponse);
    if (updateResponseResult.error) {
      throw new ValidationError('Failed to parse MCP server update response', {
        cause: updateResponseResult.error,
      });
    }

    return updateResponse;
  }

  async generateUrl(params: GenerateURLParams): Promise<GenerateURLResponse> {
    const urlResponse = await this.client.mcp.generate.url(params);
    return urlResponse;
  }
}
