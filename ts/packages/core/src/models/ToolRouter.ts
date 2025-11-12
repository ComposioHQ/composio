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
 * const session = await composio.create(userId);
 * ```
 */
import { Composio as ComposioClient } from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { ComposioConfig } from '../composio';
import {
  ToolRouterAuthorizeFn,
  ToolRouterToolkitsFn,
  ToolRouterConfig,
  ToolRouterSession,
} from '../types/toolRouter.types';
import { ToolRouterConfigSchema } from '../types/toolRouter.types';
import { Tool } from '../types/tool.types';
import { Tools } from './Tools';
import { ExecuteToolModifiers } from '../types/modifiers.types';
import { getRandomShortId } from '../utils/uuid';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { createConnectionRequest } from './ConnectionRequest';
import { ConnectedAccountStatuses } from '../types/connectedAccounts.types';

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

  /**
   * Creates a function that authorizes a toolkit for a user.
   * @param sessionId {string} The session id to create the authorize function for
   * @returns {ToolRouterAuthorizeFn} The authorize function
   *
   */
  private createAuthorizeFn = (sessionId: string): ToolRouterAuthorizeFn => {
    const authorizeFn = async (
      toolkit: string,
      options?: { callbackUrl?: string }
    ): Promise<ConnectionRequest> => {
      // @TODO make network request to authorize a toolkit
      const response = {
        link_token: '1234567890',
        redirect_url: 'https://example.com',
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        connected_account_id: '1234567890',
      };
      return createConnectionRequest(
        this.client,
        response.connected_account_id,
        ConnectedAccountStatuses.INITIATED,
        response.redirect_url
      );
    };
    return authorizeFn;
  };

  /**
   *
   * @param sessionId {string} The session id to create the connections function for
   * @returns {ToolRouterConectionsFn} The connections function
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
   *
   * const composio = new Composio();
   * const sessionId = 'session_123';
   *
   * const session = await composio.create(sessionId);
   * console.log(connections);
   * ```
   */
  private createToolkitsFn = (sessionId: string): ToolRouterToolkitsFn => {
    const conectionsFn = async () => {
      // @TODO make network request to get the connections
      const response = {};
      return {};
    };
    return conectionsFn;
  };

  /**
   * @internal
   * Creates a function that wraps the tools based on the provider.
   * The returned tools will be of the type the frameworks expects.
   *
   * @param userId - The user id to get the tools for
   * @param tools - The tools to wrap
   * @returns A function that wraps the tools based on the provider.
   */
  private createToolsFn = (
    userId: string,
    tools: Tool[]
  ): ((modifiers?: ExecuteToolModifiers) => ReturnType<TProvider['wrapTools']>) => {
    const tool = new Tools(this.client, this.config);
    return (modifiers?: ExecuteToolModifiers) =>
      tool.wrapToolsForProvider(userId, tools, modifiers);
  };

  /**
   * @TODO remove this after implementing session fetching, the tools will be returned by the session response
   * @returns {Promise<Tool[]>} The tool router tools
   */
  private getToolRouterTools = async ({
    includeManageConnectionsTool,
  }: {
    includeManageConnectionsTool?: boolean;
  }): Promise<Tool[]> => {
    const tools = [
      'COMPOSIO_SEARCH_TOOLS',
      'COMPOSIO_REMOTE_WORKBENCH',
      'COMPOSIO_MULTI_EXECUTE_TOOL',
    ];
    if (includeManageConnectionsTool) {
      tools.push('COMPOSIO_MANAGE_CONNECTIONS');
    }
    const tool = new Tools(this.client, this.config);
    const routerTools = await tool.getRawComposioTools({
      tools: tools,
    });

    return routerTools;
  };

  /**
   * Creates a new tool router session for a user.
   *
   * @param userId {string} The user id to create the session for
   * @param config {ToolRouterConfig} The config for the tool router session
   * @returns {Promise<ToolRouterSession<TToolCollection, TTool, TProvider>>} The tool router session
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
   *
   * const composio = new Composio();
   * const userId = 'user_123';
   *
   * const session = await composio.create(userId, {
   *  manageConnections: true,
   * });
   *
   * console.log(session.sessionId);
   * console.log(session.url);
   * console.log(session.tools());
   * ```
   */
  async create(
    userId: string,
    config?: ToolRouterConfig
  ): Promise<ToolRouterSession<TToolCollection, TTool, TProvider>> {
    const routerConfig = ToolRouterConfigSchema.parse(config ?? {});
    // @TODO remove this after implementing session fetching,
    // Session willl automatically return the necessary tools
    const manageConnections =
      typeof routerConfig.manageConnections === 'boolean'
        ? routerConfig.manageConnections
        : routerConfig.manageConnections?.enabled !== false;
    // @TODO make network request to create a session
    const response = {
      session_id: '1234567890',
      mcp: {
        type: 'http',
        url: 'https://mcp.composio.com',
      },
      tools: await this.getToolRouterTools({
        includeManageConnectionsTool: manageConnections,
      }),
    };

    return {
      sessionId: response.session_id,
      mcp: { type: 'http', url: 'https://mcp.composio.com' },
      tools: this.createToolsFn(userId, response.tools),
      authorize: this.createAuthorizeFn(response.session_id),
      toolkits: this.createToolkitsFn(response.session_id),
    };
  }
}
