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
import { MCPCreateConfig, MCPAuthOptions, MCPGenerateURLParams } from '../types/mcp.types';
import { MastraCreateResponse } from '@composio/mastra';

type McpServerUrlInfo = {
  url: URL;
  name: string
};

type McpServerGetParams = {
  userIds?: string[];
  connectedAccountIds?: string[];
};

type McpServerGetResponse =  McpServerUrlInfo | McpServerUrlInfo[]


type McpServerCreateResponse = {
  id: string;
  name: string;
  url: URL;
  get: (params: McpServerGetParams) => Promise<McpServerGetResponse>;
} | MastraCreateResponse;

export abstract class McpProvider {
  client?: ComposioClient;

  setup(client: ComposioClient): void {
    this.client = client;
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
   *   useManagedAuthByComposio: true,
   *   authConfigIds: ["auth_cfg_123"]
   * });
   *
   * // Create a server with specific tools
   * const mcpConfig = await composio.mcp.create("my-tools-server", {
   *   tools: ["GMAIL_FETCH_EMAIL", "SUPABASE_QUERY"]
   * });
   *
   * // Get MCP server instance for a user
   * const mcpServer = await mcpConfig.get({
   *   userIds: ["user_123"],
   *   connectedAccountIds: ["conn_acc_1", "conn_acc_2"], // Optional connected account IDs
   *  }, {
   *   useManagedAuthByComposio: true,
   * }
   * });
   * ```
   */
  async create(
    name: string,
    config: MCPCreateConfig,
    authOptions?: MCPAuthOptions
  ): Promise<McpServerCreateResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }
    // If there are multiple toolkits, we need to create a custom MCP server
    const isMultiApp = !!config.toolkits?.length;
    const mcpServerCreatedResponse: McpCreateResponse | CustomCreateResponse = isMultiApp
      ? await this.client.mcp.custom.create({
          name,
          toolkits: config.toolkits || [],
          custom_tools: config.tools || [],
          managed_auth_via_composio: authOptions?.useManagedAuthByComposio || false,
          auth_config_ids: authOptions?.authConfigIds || [],
        })
      : await this.client.mcp.create({
          name,
          allowed_tools: config.tools || [],
          managed_auth_via_composio: authOptions?.useManagedAuthByComposio || false,
          auth_config_ids: authOptions?.authConfigIds || [],
        });

    // Add get method to response
    return {
      id: mcpServerCreatedResponse.id,
      url: new URL(mcpServerCreatedResponse.mcp_url),
      name: mcpServerCreatedResponse.name,
      get: async (params: MCPGenerateURLParams): Promise<McpServerGetResponse> => {
        const { userIds = [], connectedAccountIds = [], useManagedAuthByComposio = false } = params;

        if (!this.client) {
          throw new Error('Client not set');
        }

        if (connectedAccountIds?.length && userIds?.length) {
          throw new Error(
            'Cannot generate URL for both userIds and connectedAccountIds at the same time, Please provide either userIds or connectedAccountIds'
          );
        }

        if (!connectedAccountIds?.length && !userIds?.length) {
          throw new Error('Must provide either userIds or connectedAccountIds');
        }

        const data = await this.client.mcp.generate.url({
          user_ids: userIds,
          connected_account_ids: connectedAccountIds,
          mcp_server_id: mcpServerCreatedResponse.id,
          managed_auth_by_composio: useManagedAuthByComposio || false,
        });

        if (connectedAccountIds?.length > 0) {
          return data.connected_account_urls.map((url: string, index: number) => {
            return {
              url: new URL(url),
              name: `${mcpServerCreatedResponse.name}-${connectedAccountIds[index]}`,
            };
          });
        } else if (userIds?.length > 0) {
          return data.user_ids_url.map((url: string, index: number) => {
            return {
              url: new URL(url),
              name: `${mcpServerCreatedResponse.name}-${userIds[index]}`,
            };
          });
        }
        return {
          url: new URL(data.mcp_url),
          name: mcpServerCreatedResponse.name,
        };
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
   * @param {MCPCreateConfig} config - Updated server configuration
   * @param {MCPAuthOptions} [authOptions] - Updated authentication options
   * @returns {Promise<McpUpdateResponse>} Updated server details
   */
  async update(
    id: string,
    name: string,
    config: MCPCreateConfig,
    authOptions?: MCPAuthOptions
  ): Promise<McpUpdateResponse> {
    if (!this.client) {
      throw new Error('Client not set');
    }
    return this.client.mcp.update(id, {
      name,
      toolkits: config.toolkits,
      allowed_tools: config.tools,
      managed_auth_via_composio: authOptions?.useManagedAuthByComposio || false,
    });
  }
}

export class BaseMcpProvider extends McpProvider {
  setup(client: ComposioClient): void {
    this.client = client;
  }
}

/**
 * @internal
 * Base class for all toolsets.
 * This class is not meant to be used directly, but rather to be extended by different provider implementations.
 */
abstract class BaseProvider {
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
  abstract readonly mcp?: McpProvider;
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
export abstract class BaseNonAgenticProvider<TToolCollection, TTool> extends BaseProvider {
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
export abstract class BaseAgenticProvider<TToolCollection, TTool> extends BaseProvider {
  override readonly _isAgentic = true;

  readonly mcp = new BaseMcpProvider();

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
export type BaseComposioProvider<TToolCollection, TTool> =
  | BaseNonAgenticProvider<TToolCollection, TTool>
  | BaseAgenticProvider<TToolCollection, TTool>;
