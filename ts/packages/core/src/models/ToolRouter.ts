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
  ToolRouterCreateSessionConfig,
  ToolRouterSession,
  ToolkitConnectionStateSchema,
} from '../types/toolRouter.types';
import { ToolRouterCreateSessionConfigSchema } from '../types/toolRouter.types';
import { Tools } from './Tools';
import { ProviderOptions } from '../types/modifiers.types';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { createConnectionRequest } from './ConnectionRequest';
import { ConnectedAccountStatuses } from '../types/connectedAccounts.types';
import { transform } from '../utils/transform';
import { SessionCreateParams } from '@composio/client/resources/tool-router.mjs';
import { transformToolRouterToolsParams } from '../lib/toolRouterParams';

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
    const connectionsFn = async (options?: {
      toolkits?: Array<string>;
      nextCursor?: string;
      limit?: number;
    }) => {
      const result = await this.client.toolRouter.session.toolkits(sessionId, {
        cursor: options?.nextCursor,
        limit: options?.limit,
        toolkits: options?.toolkits,
      });

      const toolkitConnectedStates = result.items.map(item => {
        const connectedState = transform(item)
          .with(ToolkitConnectionStateSchema)
          .using(item => ({
            slug: item.slug,
            name: item.name,
            logo: item.meta.logo,
            isNoAuth: false,
            connection: {
              isActive: item.connected_account?.status === 'ACTIVE',
              authConfig: item.connected_account && {
                id: item.connected_account?.auth_config.id,
                mode: item.connected_account?.auth_config.auth_scheme,
                isComposioManaged: item.connected_account?.auth_config.is_composio_managed,
              },
              connectedAccount: item.connected_account
                ? {
                    id: item.connected_account.id,
                    status: item.connected_account.status,
                  }
                : undefined,
            },
          }));
        return connectedState;
      });

      return {
        items: toolkitConnectedStates,
        nextCursor: result.next_cursor,
        totalPages: result.total_pages,
      };
    };

    return connectionsFn as ToolRouterToolkitsFn;
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
    config?: ToolRouterCreateSessionConfig
  ): Promise<ToolRouterSession<TToolCollection, TTool, TProvider>> {
    const routerConfig = ToolRouterCreateSessionConfigSchema.parse(config ?? {});

    const manageConnectedAccounts =
      typeof routerConfig.manageConnections === 'boolean'
        ? routerConfig.manageConnections
        : (routerConfig.manageConnections?.enabled ?? true);

    const toolkits = Array.isArray(routerConfig.toolkits)
      ? { enabled: routerConfig.toolkits }
      : routerConfig.toolkits;

    // const tools = transformToolRouterToolsParams(routerConfig.tools);

    const inferScopesFromTools =
      typeof routerConfig.manageConnections === 'object'
        ? routerConfig.manageConnections.inferScopesFromTools
        : false;

    const payload: SessionCreateParams = {
      user_id: userId,
      toolkits,
      auth_configs: routerConfig.authConfigs,
      connected_accounts: routerConfig.connectedAccounts,
      // tools: tools,
      connections: {
        infer_scopes_from_tools: inferScopesFromTools,
        auto_manage_connections: manageConnectedAccounts,
        callback_uri:
          typeof routerConfig.manageConnections === 'object'
            ? routerConfig.manageConnections.callbackUri
            : undefined,
      },
      execution: routerConfig.execution
        ? {
            proxy_execution_enabled: routerConfig.execution?.proxyExecutionEnabled,
            timeout_seconds: routerConfig.execution?.timeoutSeconds,
          }
        : undefined,
    };
    const session = await this.client.toolRouter.session.create(payload);

    return {
      sessionId: session.session_id,
      mcp: {
        type: session.mcp.type,
        url: session.mcp.url,
      },
      tools: this.createToolsFn(userId, session.tool_router_tools),
      authorize: this.createAuthorizeFn(session.session_id),
      toolkits: this.createToolkitsFn(session.session_id),
    };
  }

  /**
   * Use an existing session
   * @param id {string} The id of the session to use
   * @returns {Promise<ToolRouterSession<TToolCollection, TTool, TProvider>>} The tool router session
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
   *
   * const composio = new Composio();
   * const id = 'session_123';
   * const session = await composio.toolRouter.use(id);
   *```
   */
  async use(id: string): Promise<ToolRouterSession<TToolCollection, TTool, TProvider>> {
    const session = await this.client.toolRouter.session.retrieve(id);
    return {
      sessionId: session.session_id,
      mcp: {
        type: session.mcp.type,
        url: session.mcp.url,
      },
      tools: this.createToolsFn(session.config.user_id, session.tool_router_tools),
      authorize: this.createAuthorizeFn(session.session_id),
      toolkits: this.createToolkitsFn(session.session_id),
    };
  }
}
