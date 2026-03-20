/**
 * ToolRouter class for managing tool router sessions.
 *
 * @description Allows you to create an isolated toolRouter MCP session for a user
 * @example
 * ```typescript
 * import { Composio } from '@composio/core';
 *
 * const composio = new Composio();
 * const userId = 'user_123';
 *
 * const session = await composio.experimental.create(userId, {
 *   toolkits: ['gmail'],
 *   manageConnections: true
 * });
 *
 * console.log(session.mcp.url);
 * ```
 */
import { Composio as ComposioClient } from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { ComposioConfig } from '../composio';
import {
  ToolRouterCreateSessionConfig,
  Session,
  SessionExperimental,
  MCPServerType,
  ToolRouterMCPServerConfig,
} from '../types/toolRouter.types';
import { ToolRouterCreateSessionConfigSchema } from '../types/toolRouter.types';
import {
  SessionCreateParams,
  SessionCreateResponse,
} from '@composio/client/resources/tool-router/session/session.mjs';
import {
  transformToolRouterTagsParams,
  transformToolRouterToolsParams,
  transformToolRouterManageConnectionsParams,
  transformToolRouterWorkbenchParams,
  transformToolRouterToolkitsParams,
} from '../lib/toolRouterParams';
import { ToolRouterSession } from './ToolRouterSession';
import { buildCustomToolsMapFromResponse, serializeCustomTools, serializeCustomToolkits } from './CustomTool';
import type { CustomToolsMap } from '../types/customTool.types';

export class ToolRouter<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  constructor(
    private client: ComposioClient,
    private config?: ComposioConfig<TProvider>
  ) {
    telemetry.instrument(this, 'ToolRouter');
  }

  private createMCPServerConfig({
    type,
    url,
  }: {
    type: MCPServerType;
    url: string;
  }): ToolRouterMCPServerConfig {
    return {
      type,
      url,
      headers: {
        ...(this.config?.apiKey ? { 'x-api-key': this.config.apiKey } : {}),
      },
    };
  }

  /**
   * Creates a new tool router session for a user.
   *
   * @param userId {string} The user id to create the session for
   * @param config {ToolRouterCreateSessionConfig} The config for the tool router session
   * @returns {Promise<Session<TToolCollection, TTool, TProvider>>} The tool router session
   *
   * @example
   * ```typescript
   * import { Composio, experimental_createTool } from '@composio/core';
   *
   * const composio = new Composio();
   *
   * const session = await composio.create('user_123', {
   *   toolkits: ['gmail'],
   *   manageConnections: true,
   *   experimental: {
   *     customTools: [myCustomTool],
   *     customToolkits: [myToolkit],
   *   },
   * });
   * ```
   */
  async create(
    userId: string,
    config?: ToolRouterCreateSessionConfig
  ): Promise<Session<TToolCollection, TTool, TProvider>> {
    const routerConfig = ToolRouterCreateSessionConfigSchema.parse(config ?? {});

    // Extract custom tools/toolkits from experimental config
    const customTools = routerConfig.experimental?.customTools;
    const customToolkits = routerConfig.experimental?.customToolkits;

    // Build the typed experimental payload for the backend
    const experimentalPayload: SessionCreateParams['experimental'] = {};

    if (routerConfig.experimental?.assistivePrompt?.userTimezone) {
      experimentalPayload.assistive_prompt_config = {
        user_timezone: routerConfig.experimental.assistivePrompt.userTimezone,
      };
    }

    if (customTools?.length) {
      experimentalPayload.custom_tools = serializeCustomTools(customTools);
    }
    if (customToolkits?.length) {
      experimentalPayload.custom_toolkits = serializeCustomToolkits(customToolkits);
    }

    const payload: SessionCreateParams = {
      user_id: userId,
      auth_configs: routerConfig.authConfigs,
      connected_accounts: routerConfig.connectedAccounts,
      toolkits: transformToolRouterToolkitsParams(routerConfig.toolkits),
      tools: transformToolRouterToolsParams(routerConfig.tools),
      tags: transformToolRouterTagsParams(routerConfig.tags),
      manage_connections: transformToolRouterManageConnectionsParams(
        routerConfig.manageConnections
      ),
      workbench: transformToolRouterWorkbenchParams(routerConfig.workbench),
      experimental: Object.keys(experimentalPayload).length > 0
        ? experimentalPayload
        : undefined,
    };

    const session = await this.client.toolRouter.session.create(payload);

    // Build custom tools map from the response's slug/original_slug mapping
    // instead of computing LOCAL_ prefix client-side
    let customToolsMap: CustomToolsMap | undefined;
    if (customTools?.length || customToolkits?.length) {
      customToolsMap = buildCustomToolsMapFromResponse(
        customTools ?? [],
        customToolkits,
        session.experimental
      );
    }

    const assistivePrompt = session.experimental?.assistive_prompt;

    return new ToolRouterSession<TToolCollection, TTool, TProvider>(
      this.client,
      this.config,
      session.session_id,
      this.createMCPServerConfig(session.mcp),
      { assistivePrompt },
      customToolsMap,
      userId
    );
  }

  /**
   * Use an existing session
   * @param id {string} The id of the session to use
   * @returns {Promise<Session<TToolCollection, TTool, TProvider>>} The tool router session
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
   *
   * const composio = new Composio();
   * const id = 'session_123';
   * const session = await composio.toolRouter.use(id);
   *
   * console.log(session.mcp.url);
   * console.log(session.mcp.headers);
   * ```
   */
  async use(id: string): Promise<Session<TToolCollection, TTool, TProvider>> {
    const session = await this.client.toolRouter.session.retrieve(id);
    return new ToolRouterSession<TToolCollection, TTool, TProvider>(
      this.client,
      this.config,
      session.session_id,
      this.createMCPServerConfig(session.mcp)
    );
  }
}
