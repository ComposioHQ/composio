/**
 * @fileoverview MCP class for Composio SDK, used to manage MCP servers.
 *
 * @author Apoorv Taneja <apoorv@composio.dev>
 * @date 2025-06-10
 * @module MCP
 */
import ComposioClient from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {
  MCPSingleAppServer,
  MCPMultiAppServer,
  MCPServerUpdateParams,
  MCPType
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
   * @param {string} type - Type of server ('gmail', 'github', 'custom', etc.)
   * @param {MCPSingleAppServer | MCPMultiAppServer} config - Server configuration
   * @returns {Promise<McpCreateResponse>} Created server details
   * 
   * @example
   * ```typescript
   * // Create a single-app server for GitHub integration
   * const githubServer = await mcp.create('github', {
   *   name: "github-actions-server",
   *   tools: ["GITHUB_CREATE_ISSUE", "GITHUB_UPDATE_PR"],
   *   authConfigId: "auth_cfg_abc123def456"
   * });
   * 
   * // Create a custom multi-app server with multiple toolkits
   * const customServer = await mcp.create('custom', {
   *   name: "development-integration-server",
   *   tools: ["GITHUB_CREATE_ISSUE", "JIRA_CREATE_TICKET"],
   *   toolkits: ["github", "jira"]
   * });
   * ```
   */
  async create(
    type: MCPType,
    config: MCPSingleAppServer | MCPMultiAppServer
  ): Promise<McpCreateResponse | CustomCreateResponse> {
    if (type === 'custom') {
      return this.client.mcp.custom.create({
        name: config.name,
        custom_tools: (config as MCPMultiAppServer).tools,
        toolkits: (config as MCPMultiAppServer).toolkits,
      });
    }
    return this.client.mcp.create({
      name: config.name,
      allowed_tools: (config as MCPSingleAppServer).tools,
      auth_config_id: (config as MCPSingleAppServer).authConfigId,
    });
  }

  /**
   * List MCP servers
   * @param {string} [toolkit] - Optional toolkit name to filter servers
   * @returns {Promise<McpListResponse>} List of MCP servers
   * 
   * @example
   * ```typescript
   * // List all servers
   * const allServers = await mcp.list();
   * 
   * // List Gmail servers
   * const gmailServers = await mcp.list('gmail');
   * ```
   */
  async list(toolkit?: string): Promise<McpListResponse> {
    return this.client.mcp.list({
      toolkit,
    });
  }

  /**
   * Get details of a specific MCP server
   * @param {string} id - Server UUID
   * @returns {Promise<McpCreateResponse>} Server details
   * 
   * @example
   * ```typescript
   * const serverDetails = await mcp.get('server-uuid');
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
   * const result = await mcp.delete('server-uuid');
   * ```
   */
  async delete(id: string): Promise<McpDeleteResponse> {
    return this.client.mcp.delete(id);
  }

  /**
   * Update an MCP server
   * @param {string} id - Server UUID
   * @param {MCPServerUpdateParams} params - Update parameters
   * @returns {Promise<McpUpdateResponse>} Updated server details
   * 
   * @example
   * ```typescript
   * const updatedServer = await mcp.update('server-uuid', {
   *   name: 'new-name',
   *   toolkits: ['gmail'],
   *   allowedTools: ['GMAIL_FETCH_EMAIL']
   * });
   * ```
   */
  async update(id: string, params: MCPServerUpdateParams): Promise<McpUpdateResponse> {
    return this.client.mcp.update(id, {
      name: params.name,
      apps: params.toolkits,
      actions: params.allowedTools,
    });
  }
}