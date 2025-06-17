import { McpCreateResponse } from '@composio/client/resources/index';
import ComposioClient from '@composio/client';
import {
  CustomCreateResponse,
  McpListResponse,
  McpUpdateResponse,
  McpDeleteResponse,
} from '@composio/client/resources/mcp';
import {
  MCPToolkitConfig,
  MCPAuthOptions,
  MCPGetServerParams,
  McpUrlResponse,
  McpServerCreateResponse,
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
import { ValidationError } from '../errors/ValidationErrors';

export class McpProvider<T> {
  client?: ComposioClient;

  setup(client: ComposioClient): void {
    this.client = client;
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
   * ```
   */
  async create(
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<McpServerCreateResponse<T>> {
    if (!this.client) {
      throw new Error('Client not set');
    }

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
      getServer: async (params: MCPGetServerParams): Promise<T> => {
        if (!this.client) {
          throw new Error('Client not set');
        }

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
            mcp_server_id: mcpServerCreatedResponse.id,
            managed_auth_by_composio: authOptions?.useComposioManagedAuth || false,
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

        // Let derived classes handle the response transformation
        return this.transformGetResponse(
          data,
          mcpServerCreatedResponse.name,
          paramsResult.data.connectedAccountIds
            ? Object.values(paramsResult.data.connectedAccountIds)
            : undefined,
          paramsResult.data.userId ? [paramsResult.data.userId] : undefined,
          paramsResult.data.connectedAccountIds
            ? Object.keys(paramsResult.data.connectedAccountIds)
            : undefined
        );
      },
    };
  }

  protected transformGetResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): T {
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${connectedAccountIds[index]}`,
        toolkit: toolkits?.[index],
      })) as T;
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${userIds[index]}`,
        toolkit: toolkits?.[index],
      })) as T;
    }
    return {
      url: new URL(data.mcp_url),
      name: serverName,
    } as T;
  }

  /**
   * List MCP server configurations with filtering options
   * @param {Object} options - Filtering and pagination options
   * @param {number} [options.page] - Page number for pagination
   * @param {number} [options.limit] - Number of items per page
   * @param {string[]} [options.toolkits] - Filter servers by toolkit names
   * @param {string[]} [options.authConfigs] - Filter servers by auth config IDs
   * @param {string} [options.name] - Filter servers by name
   * @returns {Promise<McpListResponse>} List of MCP servers matching the filters
   */
  async list(options: {
    page?: number;
    limit?: number;
    toolkits?: string[];
    authConfigs?: string[];
    name?: string;
  }): Promise<McpListResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }

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
   */
  async get(id: string): Promise<McpCreateResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }

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
   */
  async delete(id: string): Promise<McpDeleteResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }

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
   */
  async update(
    id: string,
    name: string,
    toolkitConfigs: MCPToolkitConfig[],
    authOptions?: MCPAuthOptions
  ): Promise<McpUpdateResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }

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
}
