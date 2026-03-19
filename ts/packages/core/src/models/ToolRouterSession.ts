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
  ToolRouterSessionProxyExecuteResponse,
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
import type {
  CustomToolsMap,
  CustomToolsMapEntry,
  SessionContext,
  RegisteredCustomTool,
  RegisteredCustomToolkit,
} from '../types/customTool.types';
import type { ToolExecuteResponse } from '../types/tool.types';
import type { SessionProxyExecuteParams } from '../types/toolRouter.types';
import { SessionProxyExecuteParamsSchema } from '../types/toolRouter.types';
import { SessionContextImpl } from './SessionContext';
import { findCustomTool, executeCustomTool } from './customToolExecution';
import { transformProxyParams } from './proxyParamsTransform';

const COMPOSIO_MULTI_EXECUTE_TOOL = 'COMPOSIO_MULTI_EXECUTE_TOOL';

export class ToolRouterSession<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  public readonly sessionId: string;
  public readonly mcp: ToolRouterMCPServerConfig;
  public readonly experimental: SessionExperimental;

  /** Singleton session context — shared across all custom tool executions */
  private readonly sessionContext?: SessionContext;

  constructor(
    private readonly client: ComposioClient,
    private readonly config: ComposioConfig<TProvider> | undefined,
    sessionId: string,
    mcp: ToolRouterMCPServerConfig,
    experimentalOverrides?: Pick<SessionExperimental, 'assistivePrompt'>,
    private readonly customToolsMap?: CustomToolsMap,
    private readonly userId?: string
  ) {
    if (customToolsMap && !userId) {
      throw new Error('userId is required when custom tools are bound to a session.');
    }
    this.sessionId = sessionId;
    this.mcp = mcp;
    this.experimental = {
      assistivePrompt: experimentalOverrides?.assistivePrompt,
      files: new ToolRouterSessionFilesMount(client, sessionId),
    };

    // Create singleton session context if custom tools are bound
    if (customToolsMap && userId) {
      this.sessionContext = new SessionContextImpl(client, userId, sessionId, customToolsMap);
    }

    telemetry.instrument(this, 'ToolRouterSession');
  }

  /**
   * Get the tools available in the session, formatted for your AI framework.
   * Requires a provider to be configured in the Composio constructor.
   *
   * When custom tools are bound to the session, execution of COMPOSIO_MULTI_EXECUTE_TOOL
   * is intercepted: local tools are executed in-process, remote tools are sent to the backend.
   */
  async tools(modifiers?: SessionMetaToolOptions): Promise<ReturnType<TProvider['wrapTools']>> {
    const ToolsModel = new Tools<TToolCollection, TTool, TProvider>(this.client, this.config);
    const tools = await ToolsModel.getRawToolRouterMetaTools(
      this.sessionId,
      modifiers?.modifySchema ? { modifySchema: modifiers.modifySchema } : undefined
    );

    if (this.hasCustomTools()) {
      // Create an execute function that splits local/remote tools in COMPOSIO_MULTI_EXECUTE_TOOL
      const routingExecuteFn = async (
        toolSlug: string,
        input: Record<string, unknown>
      ): Promise<ToolExecuteResponse> => {
        if (toolSlug === COMPOSIO_MULTI_EXECUTE_TOOL) {
          return this.routeMultiExecute(input, ToolsModel, modifiers);
        }
        // Non-multi-execute meta tools always go to backend
        return ToolsModel.executeMetaTool(
          toolSlug,
          { sessionId: this.sessionId, arguments: input },
          modifiers
        );
      };

      if (!this.config?.provider) {
        throw new Error(
          'A provider is required when using custom tools with session.tools(). ' +
          'Pass a provider in the Composio constructor.'
        );
      }
      return this.config.provider.wrapTools(tools, routingExecuteFn) as ReturnType<
        TProvider['wrapTools']
      >;
    }

    // Standard path (no local tools)
    const wrappedTools = ToolsModel.wrapToolsForToolRouter(this.sessionId, tools, modifiers);
    return wrappedTools as ReturnType<TProvider['wrapTools']>;
  }

  /**
   * List all custom tools registered in this session.
   * Returns tools with their final slugs, schemas, and resolved toolkit.
   *
   * @param options.toolkit - Filter by toolkit slug (e.g. 'gmail', 'DEV_TOOLS')
   * @returns Array of registered custom tools
   */
  customTools(options?: { toolkit?: string }): RegisteredCustomTool[] {
    if (!this.customToolsMap) return [];

    const entries = Array.from(this.customToolsMap.byFinalSlug.values());
    const filtered = options?.toolkit
      ? entries.filter(e => e.toolkit?.toLowerCase() === options.toolkit!.toLowerCase())
      : entries;

    return filtered.map(entry => ({
      slug: entry.finalSlug,
      name: entry.handle.name,
      description: entry.handle.description,
      toolkit: entry.toolkit,
      inputSchema: entry.handle.inputSchema,
      outputSchema: entry.handle.outputSchema,
    }));
  }

  /**
   * List all custom toolkits registered in this session.
   * Returns toolkits with their tools showing final slugs.
   *
   * @returns Array of registered custom toolkits
   */
  customToolkits(): RegisteredCustomToolkit[] {
    const toolkits = this.customToolsMap?.toolkits;
    if (!toolkits?.length) return [];

    return toolkits.map(tk => ({
      slug: tk.slug,
      name: tk.name,
      description: tk.description,
      tools: tk.tools.map(tool => {
        // Look up the entry to get the final slug
        const entry = this.customToolsMap!.byOriginalSlug.get(tool.slug.toUpperCase());
        return {
          slug: entry?.finalSlug ?? tool.slug,
          name: tool.name,
          description: tool.description,
          toolkit: tk.slug,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
        };
      }),
    }));
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
   * For custom tools, accepts the original slug (e.g. "GREP") or the
   * full slug (e.g. "LOCAL_GREP"). Custom tools are executed in-process;
   * remote tools are sent to the Composio backend.
   *
   * @param toolSlug - The tool slug to execute
   * @param arguments_ - Optional tool arguments
   * @returns The tool execution result
   */
  async execute(
    toolSlug: string,
    arguments_?: Record<string, unknown>
  ): Promise<ToolRouterSessionExecuteResponse> {
    // Check if this is a local tool (by original or final slug)
    const entry = findCustomTool(this.customToolsMap, toolSlug);
    if (entry) {
      const result = await executeCustomTool(entry, arguments_ ?? {}, this.sessionContext!);
      return {
        data: result.data,
        error: result.error,
        logId: '',
      };
    }

    // Remote execution
    const response = await this.client.toolRouter.session.execute(this.sessionId, {
      tool_slug: toolSlug,
      arguments: arguments_ ?? {},
    });
    const transformed = transformExecuteResponse(response);
    return ToolRouterSessionExecuteResponseSchema.parse(transformed);
  }

  /**
   * Proxy an API call through Composio's auth layer using the session's connected account.
   * The backend resolves the connected account from the toolkit within the session.
   *
   * @param params - Proxy request parameters (toolkit, endpoint, method, body, headers/query params)
   * @returns The proxied API response with status, data, headers
   */
  async proxyExecute(params: SessionProxyExecuteParams): Promise<ToolRouterSessionProxyExecuteResponse> {
    const validated = SessionProxyExecuteParamsSchema.safeParse(params);
    if (!validated.success) {
      throw new ValidationError('Invalid proxy execute parameters', { cause: validated.error });
    }

    const clientParams = transformProxyParams(validated.data);
    const response = await this.client.toolRouter.session.proxyExecute(
      this.sessionId,
      clientParams
    );

    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
      ...(response.binary_data ? {
        binaryData: {
          contentType: response.binary_data.content_type,
          size: response.binary_data.size,
          url: response.binary_data.url,
          expiresAt: response.binary_data.expires_at,
        },
      } : {}),
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  /** Check if this session has any custom tools bound. */
  private hasCustomTools(): boolean {
    return (this.customToolsMap?.byFinalSlug.size ?? 0) > 0;
  }

  /** Parse an individual tool item from COMPOSIO_MULTI_EXECUTE_TOOL's tools array */
  private parseToolItem(item: unknown): { tool_slug: string; arguments: Record<string, unknown> } {
    if (typeof item !== 'object' || item === null) {
      return { tool_slug: '', arguments: {} };
    }
    const obj = item as Record<string, unknown>;
    return {
      tool_slug: String(obj.tool_slug ?? ''),
      arguments: (obj.arguments as Record<string, unknown> | undefined) ?? {},
    };
  }

  /**
   * Route a COMPOSIO_MULTI_EXECUTE_TOOL call.
   * Splits the tools[] array into local and remote, executes each appropriately,
   * and merges results preserving original order.
   */
  private async routeMultiExecute(
    input: Record<string, unknown>,
    ToolsModel: Tools<TToolCollection, TTool, TProvider>,
    modifiers?: SessionMetaToolOptions
  ): Promise<ToolExecuteResponse> {
    const toolItems = input.tools as unknown[];
    if (!Array.isArray(toolItems) || toolItems.length === 0) {
      // Fallback: send to backend as-is
      return ToolsModel.executeMetaTool(
        COMPOSIO_MULTI_EXECUTE_TOOL,
        { sessionId: this.sessionId, arguments: input },
        modifiers
      );
    }

    const parsed = toolItems.map(item => this.parseToolItem(item));

    // Partition into local (with resolved entry) and remote
    const localItems: Array<{ index: number; entry: CustomToolsMapEntry }> = [];
    const remoteIndices: number[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const entry = findCustomTool(this.customToolsMap, parsed[i].tool_slug);
      if (entry) {
        localItems.push({ index: i, entry });
      } else {
        remoteIndices.push(i);
      }
    }

    // All remote — just forward entire payload
    if (localItems.length === 0) {
      return ToolsModel.executeMetaTool(
        COMPOSIO_MULTI_EXECUTE_TOOL,
        { sessionId: this.sessionId, arguments: input },
        modifiers
      );
    }

    // Execute local tools in parallel (shared singleton context)
    const ctx = this.sessionContext!;
    const localPromises = localItems.map(async ({ index, entry }) => {
      const result = await executeCustomTool(entry, parsed[index].arguments, ctx);
      return { index, result };
    });

    // Execute remote tools via backend in parallel with local
    let remotePromise: Promise<ToolExecuteResponse> | undefined;
    if (remoteIndices.length > 0) {
      const remoteToolItems = remoteIndices.map(i => toolItems[i]);
      const remoteInput = { ...input, tools: remoteToolItems };
      remotePromise = ToolsModel.executeMetaTool(
        COMPOSIO_MULTI_EXECUTE_TOOL,
        { sessionId: this.sessionId, arguments: remoteInput },
        modifiers
      );
    }

    const [localResults, remoteResult] = await Promise.all([
      Promise.all(localPromises),
      remotePromise,
    ]);

    // If only local tools, return the single/first result unwrapped
    if (remoteIndices.length === 0 && localResults.length === 1) {
      return localResults[0].result;
    }

    // Merge results into the backend's results[] format.
    const remoteData = (remoteResult?.data ?? {}) as Record<string, unknown>;
    const remoteResults = (Array.isArray(remoteData.results) ? remoteData.results : []) as unknown[];

    // Build local result entries matching backend format
    const localEntries = localResults.map(({ index, result }) => ({
      response: {
        successful: result.successful,
        data: result.data,
        ...(result.error ? { error: result.error } : {}),
      },
      tool_slug: parsed[index].tool_slug,
      ...(result.error ? { error: result.error } : {}),
    }));

    // Merge and re-index sequentially so there are no collisions
    const merged: Array<Record<string, unknown>> = [
      ...(remoteResults as Array<Record<string, unknown>>),
      ...localEntries,
    ];
    const allResults = merged.map((entry, i): Record<string, unknown> => ({
      ...entry,
      index: i,
    }));
    const hasAnyError = localResults.some(r => r.result.error) || !!remoteResult?.error;

    return {
      data: { ...remoteData, results: allResults },
      error: hasAnyError
        ? `${allResults.filter(r => r.error).length} out of ${allResults.length} tools failed`
        : null,
      successful: !hasAnyError,
    };
  }

}
