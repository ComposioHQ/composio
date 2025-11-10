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
  ToolRouterConectionsFn,
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

  private createConectionsFn = (sessionId: string): ToolRouterConectionsFn => {
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

  private getToolRouterTools = async (userId: string, tools: string[]): Promise<Tool[]> => {
    const toolsModel = new Tools(this.client, this.config);
    const routerTools = await toolsModel.getRawComposioTools({
      tools: tools,
    });
    return routerTools;
  };

  async create(
    userId: string,
    config?: ToolRouterConfig
  ): Promise<ToolRouterSession<TToolCollection, TTool, TProvider>> {
    const routerConfig = ToolRouterConfigSchema.parse(config);
    const toolRouterToolSlugs = [
      'COMPOSIO_SEARCH_TOOLS',
      'COMPOSIO_REMOTE_WORKBENCH',
      'COMPOSIO_MULTI_EXECUTE_TOOL',
    ];
    // @TODO make network request to create a session
    const sessionId = getRandomShortId();

    if (routerConfig?.manageConnections) {
      toolRouterToolSlugs.push('COMPOSIO_MANAGE_CONNECTIONS');
    }

    const tools = await this.getToolRouterTools(userId, toolRouterToolSlugs);

    return {
      sessionId,
      mcp: { type: 'http', url: 'https://mcp.composio.com' },
      tools: this.createToolsFn(userId, tools),
      authorize: this.createAuthorizeFn(sessionId),
      conections: this.createConectionsFn(sessionId),
    };
  }
}
