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
  ToolkitConnectionState,
} from '../types/toolRouter.types';
import { ToolRouterConfigSchema } from '../types/toolRouter.types';
import { Tools } from './Tools';
import { ProviderOptions } from '../types/modifiers.types';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { createConnectionRequest } from './ConnectionRequest';
import { ConnectedAccountStatuses } from '../types/connectedAccounts.types';
import { getAllPages } from '../utils/pagination';

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
      const response = await this.client.toolRouter.session.link(sessionId, {
        ...(options ?? {}),
        toolkit,
      });

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
    const connectionsFn = async () => {
      const items = await getAllPages(params =>
        this.client.toolRouter.session.toolkits(sessionId, params)
      );

      console.log(JSON.stringify({ items }, null, 2));
      const toolkitConnectedStates = items.reduce(
        (acc, item) => {
          const connectedAccount = item.connected_account
            ? ({
                id: item.connected_account.id,
                status: item.connected_account.status,
              } as const)
            : undefined;

          const connectedState: ToolkitConnectionState = {
            meta: {
              slug: item.slug,
              name: item.name,
              logo: item.meta.logo,
            },
            connection: {
              isActive: item.connected_account?.status === 'ACTIVE',
              authConfig: item.connected_account && {
                id: item.connected_account?.auth_config.id,
                mode: item.connected_account?.auth_config.auth_scheme,
                isComposioManaged: item.connected_account?.auth_config.is_composio_managed,
              },
              connectedAccount,
            },
          };

          acc[item.slug] = connectedState;

          return acc;
        },
        {} as Record<string, ToolkitConnectionState>
      );

      return toolkitConnectedStates;
    };

    return connectionsFn;
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
    toolSlugs: string[]
  ): ((modifiers?: ProviderOptions<TProvider>) => Promise<ReturnType<TProvider['wrapTools']>>) => {
    return async (modifiers?: ProviderOptions<TProvider>) => {
      const ToolsModel = new Tools<TToolCollection, TTool, TProvider>(this.client, this.config);
      const tools = await ToolsModel.get(
        userId,
        {
          tools: toolSlugs,
        },
        modifiers
      );
      return tools;
    };
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
   * console.log(session.toolkits());
   * ```
   */
  async create(
    userId: string,
    config?: ToolRouterConfig
  ): Promise<ToolRouterSession<TToolCollection, TTool, TProvider>> {
    const routerConfig = ToolRouterConfigSchema.parse(config ?? {});

    const manageConnectedAccounts =
      typeof routerConfig.manageConnections === 'boolean'
        ? routerConfig.manageConnections
        : routerConfig.manageConnections?.enabled;

    // `this.client.toolRouter.createSession` only supports `ToolRouterToolkitsParamSchema` for now.
    // It the future, it may support a union with `ToolRouterToolkitsConfigSchema`.
    const toolkits = Array.isArray(routerConfig.toolkits)
      ? { enabled: routerConfig.toolkits }
      : { enabled: [] };

    const session = await this.client.toolRouter.session.create({
      user_id: userId,
      toolkits,
      connections: {
        auth_config_overrides: routerConfig?.authConfigs,
        connected_account_overrides: routerConfig?.connectedAccounts,
        infer_scopes_from_tools: undefined,
        auto_manage_connections: manageConnectedAccounts,
        callback_uri:
          typeof routerConfig.manageConnections === 'object'
            ? routerConfig.manageConnections.callbackUrl
            : undefined,
      },
    });

    return {
      sessionId: session.session_id,
      mcp: {
        // @ts-ignore
        type: session.mcp.type.toLowerCase(),
        url: session.mcp.url,
      },
      tools: this.createToolsFn(userId, session.tool_router_tools),
      authorize: this.createAuthorizeFn(session.session_id),
      toolkits: this.createToolkitsFn(session.session_id),
    };
  }
}
