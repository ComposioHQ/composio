import type { BaseComposioProvider } from '../provider/BaseProvider';
import { telemetry } from '../telemetry/Telemetry';
import type { McpServerCreateResponse, McpRetrieveResponse } from '../types/mcp.types';
import type { MCP } from './MCP';

/**
 * MCPConfig (Model Control Protocol Config) class
 * Handles CRUD operations related to MCP configurations.
 */
export class MCPConfig<TProvider extends BaseComposioProvider<unknown, unknown, unknown>> {
  constructor(private mcp: MCP<TProvider>) {
    telemetry.instrument(this);
  }

  /**
   * Create a new MCP configuration.
   * @param {Object} params - Parameters for creating the MCP configuration
   * @param {Array} params.authConfig - Array of auth configurations with id and allowed tools
   * @param {Object} params.options - Configuration options
   * @param {string} params.options.name - Unique name for the MCP configuration
   * @param {boolean} [params.options.isChatAuth] - Whether to use chat-based authentication
   * @returns {Promise<McpServerCreateResponse<T>>} Created server details with instance getter
   *
   * @example
   * ```typescript
   * const server = await composio.mcpConfig.create("personal-mcp-server", [
   *     {
   *       authConfigId: "ac_xyz",
   *       allowedTools: ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"]
   *     }
   *   ],
   *   {
   *     isChatAuth: true
   *   }
   * });
   * ```
   */
  async create(
    name: string,
    serverConfig: Array<{
      authConfigId: string;
      allowedTools: string[];
    }>,
    options: {
      isChatAuth?: boolean;
    }
  ): Promise<McpServerCreateResponse<typeof this.mcp.TMcpResponse>> {
    return this.mcp.create(name, serverConfig, options);
  }

  /**
   * Get details of a specific MCP config by name
   * @param {string} configName - Config name
   * @returns {Promise<McpRetrieveResponse>} Server details
   * @throws {ValidationError} If no MCP Config found with the given name
   * @throws {ValidationError} If multiple MCP Configs found with the same name
   *
   * @example
   * ```typescript
   * const mcpConfig = await composio.mcpConfig.getByName('my-gmail-server');
   * ```
   */
  async getByName(configName: string): Promise<McpRetrieveResponse> {
    return this.mcp.getByName(configName);
  }

  /**
   * Get details of a specific MCP Config
   * @param {string} configId - Config UUID
   * @returns {Promise<McpRetrieveResponse>} Config details
   *
   * @example
   * ```typescript
   * const mcpConfig = await composio.mcpConfig.get('config-uuid');
   * ```
   */
  async get(configId: string): Promise<McpRetrieveResponse> {
    return this.mcp.get(configId);
  }
}
