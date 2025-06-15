import { ComposioGlobalExecuteToolFnNotSetError } from '../errors/ToolErrors';
import { ExecuteToolModifiers } from '../types/modifiers.types';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '../types/tool.types';
import { ExecuteToolFn, GlobalExecuteToolFn } from '../types/provider.types';
import { McpCreateResponse } from '@composio/client/resources/index';
import ComposioClient from '@composio/client';
import {
  CustomCreateResponse,
  McpListResponse,
  McpUpdateResponse,
  McpDeleteResponse,
} from '@composio/client/resources/mcp';
import { MCPToolkitConfig, MCPAuthOptions, MCPGenerateURLParams, MCPGetServerParams } from '../types/mcp.types';

export type McpServerUrlInfo = {
  url: URL;
  name: string;
  toolkit?: string;
};

export type McpServerGetResponse = McpServerUrlInfo | McpServerUrlInfo[];

export type McpUrlResponse = {
  connected_account_urls?: string[];
  user_ids_url?: string[];
  mcp_url: string;
};

export type McpServerCreateResponse<T> = (McpCreateResponse | CustomCreateResponse) & {
  toolkits: string[];
  getServer: (params: MCPGetServerParams) => Promise<T>;
};

export abstract class McpProvider<T> {
  client?: ComposioClient;

  setup(client: ComposioClient): void {
    this.client = client;
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
   *   { useManagedAuthByComposio: true },
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
      getServer: async (params: MCPGetServerParams): Promise<T> => {
        if (!this.client) {
          throw new Error('Client not set');
        }

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

        const data = await this.client.mcp.generate.url({
          user_ids: params.user_id ? [params.user_id] : [],
          connected_account_ids: params.connected_account_ids ? Object.values(params.connected_account_ids) : [],
          mcp_server_id: mcpServerCreatedResponse.id,
          managed_auth_by_composio: authOptions?.useManagedAuthByComposio || false,
        });

        // Let derived classes handle the response transformation
        return this.transformGetResponse(
          data, 
          mcpServerCreatedResponse.name,
          params.connected_account_ids ? Object.values(params.connected_account_ids) : undefined,
          params.user_id ? [params.user_id] : undefined,
          params.connected_account_ids ? Object.keys(params.connected_account_ids) : undefined
        );
      }
    };
  }

  protected abstract transformGetResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): T;

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
   */
  async get(id: string): Promise<McpCreateResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }
    return this.client.mcp.retrieve(id);
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
    return this.client.mcp.delete(id);
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

export class BaseMcpProvider<T> extends McpProvider<T> {
  setup(client: ComposioClient): void {
    this.client = client;
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
}

/**
 * @internal
 * Base class for all toolsets.
 * This class is not meant to be used directly, but rather to be extended by different provider implementations.
 */
abstract class BaseProvider<TMcpResponse = unknown> {
  /**
   * @public
   * The name of the provider.
   * Used to identify the provider in the telemetry.
   */
  abstract readonly name: string;
  /**
   * @public
   * MCP provider for the framework
   */
  abstract readonly mcp?: McpProvider<TMcpResponse>;
  /**
   * @internal
   * Whether the provider is agentic.
   * This is set automatically set by the core SDK implementation for different provider types.
   */
  abstract readonly _isAgentic: boolean;
  /**
   * @internal
   * The function to execute a tool.
   * This is set automatically injected by the core SDK.
   */
  private _globalExecuteToolFn!: GlobalExecuteToolFn;
  /**
   * @internal
   * Set the function to execute a tool.
   * This is set automatically and injected by the core SDK.
   */
  _setExecuteToolFn(executeToolFn: GlobalExecuteToolFn): void {
    this._globalExecuteToolFn = executeToolFn;
  }

  /**
   * @public
   * Global function to execute a tool.
   * This function is used by providerds to implement helper functions to execute tools.
   * This is a 1:1 mapping of the `execute` method in the `Tools` class.
   * @param {string} toolSlug - The slug of the tool to execute.
   * @param {ToolExecuteParams} body - The body of the tool execution.
   * @param {ExecuteToolModifiers} modifers - The modifiers of the tool execution.
   * @returns {Promise<string>} The result of the tool execution.
   */
  executeTool(
    toolSlug: string,
    body: ToolExecuteParams,
    modifers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    if (!this._globalExecuteToolFn) {
      throw new ComposioGlobalExecuteToolFnNotSetError('executeToolFn is not set');
    }
    return this._globalExecuteToolFn(toolSlug, body, modifers);
  }
}

/**
 * @public
 * Base class for all non-agentic toolsets.
 * This class is not meant to be used directly, but rather to be extended by concrete provider implementations.
 */
export abstract class BaseNonAgenticProvider<TToolCollection, TTool, TMcpResponse = unknown> extends BaseProvider<TMcpResponse> {
  override readonly _isAgentic = false;

  /**
   * Wrap a tool in the provider specific format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  abstract wrapTool(tool: Tool): TTool;
  /**
   * Wrap a list of tools in the provider specific format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools.
   */
  abstract wrapTools(tools: Tool[]): TToolCollection;
}

/**
 * @public
 * Base class for all agentic toolsets.
 * This class is not meant to be used directly, but rather to be extended by concrete provider implementations.
 */
export abstract class BaseAgenticProvider<TToolCollection, TTool, TMcpResponse = unknown> extends BaseProvider<TMcpResponse> {
  override readonly _isAgentic = true;

  abstract readonly mcp: McpProvider<TMcpResponse>;

  /**
   * Wrap a tool in the provider specific format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  abstract wrapTool(tool: Tool, executeTool: ExecuteToolFn): TTool;
  /**
   * Wrap a list of tools in the provider specific format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools.
   */
  abstract wrapTools(tools: Tool[], executeTool: ExecuteToolFn): TToolCollection;
}

/**
 * @internal
 * Base type for all toolsets.
 * This type is used to infer the type of the provider from the provider implementation.
 */
export type BaseComposioProvider<TToolCollection, TTool, TMcpResponse = unknown> =
  | BaseNonAgenticProvider<TToolCollection, TTool, TMcpResponse>
  | BaseAgenticProvider<TToolCollection, TTool, TMcpResponse>;
