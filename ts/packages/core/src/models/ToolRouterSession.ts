import { telemetry } from '../telemetry/Telemetry';
import { Composio as ComposioClient } from '@composio/client';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { ComposioConfig } from '../composio';
import {
  ToolRouterMCPServerConfig,
  SessionExperimental,
  ToolRouterToolkitsOptions,
  ToolRouterToolkitsOptionsSchema,
  ToolRouterSessionSearchResponse,
  ToolRouterSessionSearchResponseSchema,
  ToolRouterSessionExecuteResponse,
  ToolRouterSessionExecuteResponseSchema,
} from '../types/toolRouter.types';
import {
  transformSearchResponse,
  transformExecuteResponse,
} from '../utils/transformers/toolRouterResponseTransform';
import { SessionMetaToolOptions } from '../types/modifiers.types';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { createConnectionRequest } from './ConnectionRequest';
import { ConnectedAccountStatuses } from '../types/connectedAccounts.types';
import { transform } from '../utils/transform';
import { ToolkitConnectionStateSchema } from '../types/toolRouter.types';
import { ValidationError } from '../errors';
import { Tools } from './Tools';
import { ToolRouterSessionFilesMount } from './ToolRouterSessionFileMount';

export class ToolRouterSession<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  public readonly sessionId: string;
  public readonly mcp: ToolRouterMCPServerConfig;
  public readonly experimental: SessionExperimental;

  constructor(
    private readonly client: ComposioClient,
    private readonly config: ComposioConfig<TProvider> | undefined,
    sessionId: string,
    mcp: ToolRouterMCPServerConfig,
    experimentalOverrides?: Pick<SessionExperimental, 'assistivePrompt'>
  ) {
    this.sessionId = sessionId;
    this.mcp = mcp;
    this.experimental = {
      assistivePrompt: experimentalOverrides?.assistivePrompt,
      files: new ToolRouterSessionFilesMount(client, sessionId),
    };
    telemetry.instrument(this, 'ToolRouterSession');
  }

  /**
   * Get the tools available in the session, formatted for your AI framework.
   * Requires a provider to be configured in the Composio constructor.
   */
  async tools(modifiers?: SessionMetaToolOptions): Promise<ReturnType<TProvider['wrapTools']>> {
    const ToolsModel = new Tools<TToolCollection, TTool, TProvider>(this.client, this.config);
    const tools = await ToolsModel.getRawToolRouterMetaTools(
      this.sessionId,
      modifiers?.modifySchema ? { modifySchema: modifiers.modifySchema } : undefined
    );
    const wrappedTools = ToolsModel.wrapToolsForToolRouter(this.sessionId, tools, modifiers);
    return wrappedTools as ReturnType<TProvider['wrapTools']>;
  }

  /**
   * Initiate an authorization flow for a toolkit.
   * Returns a ConnectionRequest with a redirect URL for the user.
   */
  async authorize(toolkit: string, options?: { callbackUrl?: string }): Promise<ConnectionRequest> {
    const response = await this.client.toolRouter.session.link(this.sessionId, {
      ...(options?.callbackUrl ? { callback_url: options.callbackUrl } : {}),
      toolkit,
    });

    return createConnectionRequest(
      this.client,
      response.connected_account_id,
      ConnectedAccountStatuses.INITIATED,
      response.redirect_url
    );
  }

  /**
   * Query the connection state of toolkits in the session.
   * Supports pagination and filtering by toolkit slugs.
   */
  async toolkits(options?: ToolRouterToolkitsOptions) {
    const toolkitOptions = ToolRouterToolkitsOptionsSchema.safeParse(options ?? {});
    if (!toolkitOptions.success) {
      throw new ValidationError('Failed to parse toolkits options', {
        cause: toolkitOptions.error,
      });
    }

    const result = await this.client.toolRouter.session.toolkits(this.sessionId, {
      cursor: toolkitOptions.data.nextCursor,
      limit: toolkitOptions.data.limit,
      toolkits: toolkitOptions.data.toolkits,
      is_connected: toolkitOptions.data.isConnected,
      search: toolkitOptions.data.search,
    });

    const toolkitConnectedStates = result.items.map(item => {
      const connectedState = transform(item)
        .with(ToolkitConnectionStateSchema)
        .using(item => ({
          slug: item.slug,
          name: item.name,
          logo: item.meta?.logo,
          isNoAuth: item.is_no_auth,
          connection: item.is_no_auth
            ? undefined
            : {
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
      nextCursor: result.next_cursor ?? undefined,
      totalPages: result.total_pages,
    };
  }

  /**
   * Search for tools by semantic use case.
   * Returns relevant tools for the given query with schemas and guidance.
   *
   * @param params - Search parameters
   * @param params.query - Semantic use-case query (e.g. "send emails", "create GitHub issues")
   * @param params.toolkits - Optional toolkit slugs to filter by
   * @returns Search results with matching tools and schemas
   *
   * @example
   * ```typescript
   * const session = await composio.toolRouter.use('session_123');
   * const results = await session.search({
   *   query: 'send emails and notify Slack',
   *   toolkits: ['gmail', 'slack'],
   * });
   * ```
   */
  async search(params: {
    query: string;
    toolkits?: string[];
  }): Promise<ToolRouterSessionSearchResponse> {
    const response = await this.client.toolRouter.session.search(this.sessionId, {
      queries: [{ use_case: params.query }],
      ...(params.toolkits?.length ? { toolkits: params.toolkits } : {}),
    });
    const transformed = transformSearchResponse(response);
    return ToolRouterSessionSearchResponseSchema.parse(transformed);
  }

  /**
   * Execute a tool within the session.
   *
   * @param toolSlug - The tool slug to execute (e.g. "GMAIL_SEND_EMAIL")
   * @param arguments_ - Optional tool arguments. Defaults to empty object if omitted.
   * @returns The tool execution result
   *
   * @example
   * ```typescript
   * const session = await composio.toolRouter.use('session_123');
   * const result = await session.execute('GMAIL_SEND_EMAIL', {
   *   to: 'user@example.com',
   *   subject: 'Hello',
   *   body: 'Hi!',
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Execute with no arguments
   * const result = await session.execute('HACKERNEWS_GET_USER');
   * ```
   */
  async execute(
    toolSlug: string,
    arguments_?: Record<string, unknown>
  ): Promise<ToolRouterSessionExecuteResponse> {
    const response = await this.client.toolRouter.session.execute(this.sessionId, {
      tool_slug: toolSlug,
      arguments: arguments_ ?? {},
    });
    const transformed = transformExecuteResponse(response);
    return ToolRouterSessionExecuteResponseSchema.parse(transformed);
  }
}
