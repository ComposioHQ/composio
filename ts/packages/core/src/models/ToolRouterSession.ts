import { telemetry } from '../telemetry/Telemetry';
import { Composio as ComposioClient, BadRequestError } from '@composio/client';
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
  ToolRouterSessionExecuteOptions,
  ToolRouterSessionMetadata,
  ToolRouterSessionPreloadConfig,
  ToolRouterSessionWarning,
  ToolRouterUpdateSessionConfig,
  ToolRouterUpdateSessionConfigSchema,
} from '../types/toolRouter.types';
import {
  transformSearchResponse,
  transformExecuteResponse,
} from '../utils/transformers/toolRouterResponseTransform';
import { SessionMetaToolOptions } from '../types/modifiers.types';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { createConnectionRequest } from './ConnectionRequest';
import {
  ConnectedAccountAclConfigSchema,
  ConnectedAccountStatuses,
  ConnectedAccountType,
  ConnectedAccountTypeSchema,
  ConnectedAccountAclConfig,
} from '../types/connectedAccounts.types';
import { z } from 'zod/v3';
import { transform } from '../utils/transform';
import { ToolkitConnectionStateSchema } from '../types/toolRouter.types';
import { ComposioAclOnlyForSharedError, ValidationError } from '../errors';
import { Tools } from './Tools';
import { ToolRouterSessionFilesMount } from './ToolRouterSessionFileMount';
import type {
  CustomToolsMap,
  CustomToolsMapEntry,
  SessionContext,
  RegisteredCustomTool,
  RegisteredCustomToolkit,
} from '../types/customTool.types';
import type { Tool, ToolExecuteResponse } from '../types/tool.types';
import type { SessionProxyExecuteParams } from '../types/toolRouter.types';
import type {
  SessionExecuteParams,
  SessionLinkParams,
  SessionSearchParams,
} from '@composio/client/resources/tool-router/session/session.mjs';
import { SessionProxyExecuteParamsSchema } from '../types/toolRouter.types';
import { SessionContextImpl } from './SessionContext';
import {
  assertUnambiguousCustomToolSlug,
  findCustomTool,
  executeCustomTool,
} from './customToolExecution';
import {
  findCustomToolMapEntryByFinalSlug,
  findCustomToolMapEntryByToolkitAndOriginalSlug,
} from './CustomTool';
import { transformProxyParams } from './proxyParamsTransform';
import { inlineCustomToolsExperimental } from './inlineCustomToolsPayload';
import { transformToolRouterUpdateParams } from '../lib/toolRouterParams';

const COMPOSIO_MULTI_EXECUTE_TOOL = 'COMPOSIO_MULTI_EXECUTE_TOOL';
export const DIRECT_CUSTOM_TOOL_DESCRIPTION_PREFIX =
  '[Direct tool - call directly, no search needed beforehand.]';

/**
 * Options accepted by {@link ToolRouterSession.authorize}.
 *
 * Validated at the SDK boundary so callers get clear `ValidationError`s for
 * oversized ACL lists or invalid `userId`s — same caps as the equivalent
 * `composio.connectedAccounts.link()` path (≤1000 entries per list, each
 * `userId` 1..256 characters).
 */
const AuthorizeOptionsSchema = z.object({
  callbackUrl: z.string().optional(),
  alias: z.string().optional(),
  accountType: ConnectedAccountTypeSchema.optional(),
  aclConfigForShared: ConnectedAccountAclConfigSchema.optional(),
});

export class ToolRouterSession<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  public readonly sessionId: string;
  public readonly mcp: ToolRouterMCPServerConfig;
  public readonly experimental: SessionExperimental;
  public preload: ToolRouterSessionPreloadConfig;
  public configVersion?: number;
  public warnings: ToolRouterSessionWarning[];
  private readonly preloadedCustomToolSlugs: string[];
  private readonly inlineCustomToolsPayload: ToolRouterSessionMetadata['inlineCustomToolsPayload'];

  /** Singleton session context — shared across all custom tool executions */
  private readonly sessionContext?: SessionContext;

  constructor(
    private readonly client: ComposioClient,
    private readonly config: ComposioConfig<TProvider> | undefined,
    sessionId: string,
    mcp: ToolRouterMCPServerConfig,
    experimentalOverrides?: Pick<SessionExperimental, 'assistivePrompt'>,
    private readonly customToolsMap?: CustomToolsMap,
    private readonly userId?: string,
    metadata?: ToolRouterSessionMetadata
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
    this.preload = metadata?.preload ?? { tools: [] };
    this.configVersion = metadata?.configVersion;
    this.warnings = metadata?.warnings ?? [];
    this.preloadedCustomToolSlugs = metadata?.preloadedCustomToolSlugs ?? [];
    this.inlineCustomToolsPayload = metadata?.inlineCustomToolsPayload;

    // Create singleton session context if custom tools are bound
    if (customToolsMap && userId) {
      this.sessionContext = new SessionContextImpl(
        client,
        userId,
        sessionId,
        customToolsMap,
        this.inlineCustomToolsPayload
      );
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
    const tools = await ToolsModel.getRawToolRouterSessionTools(
      this.sessionId,
      modifiers?.modifySchema ? { modifySchema: modifiers.modifySchema } : undefined
    );
    const sessionTools = await this.addPreloadedCustomTools(tools, modifiers);
    const toolBySlug = new Map(sessionTools.map(tool => [tool.slug.toUpperCase(), tool]));

    if (this.hasCustomTools()) {
      // Create an execute function that splits local/remote tools in COMPOSIO_MULTI_EXECUTE_TOOL
      const routingExecuteFn = async (
        toolSlug: string,
        input: Record<string, unknown>
      ): Promise<ToolExecuteResponse> => {
        if (toolSlug === COMPOSIO_MULTI_EXECUTE_TOOL) {
          return this.routeMultiExecute(input, ToolsModel, sessionTools, modifiers);
        }
        const customTool = findCustomTool(this.customToolsMap, toolSlug);
        if (customTool) {
          return executeCustomTool(customTool, input, this.sessionContext!);
        }
        assertUnambiguousCustomToolSlug(this.customToolsMap, toolSlug);
        return this.executeBackendSessionTool(
          ToolsModel,
          toolSlug,
          input,
          modifiers,
          toolBySlug.get(toolSlug.toUpperCase())
        );
      };

      if (!this.config?.provider) {
        throw new Error(
          'A provider is required when using custom tools with session.tools(). ' +
            'Pass a provider in the Composio constructor.'
        );
      }
      return this.config.provider.wrapTools(sessionTools, routingExecuteFn) as ReturnType<
        TProvider['wrapTools']
      >;
    }

    // Standard path (no local tools)
    const wrappedTools = ToolsModel.wrapToolsForToolRouter(this.sessionId, sessionTools, modifiers);
    return wrappedTools as ReturnType<TProvider['wrapTools']>;
  }

  private async addPreloadedCustomTools(
    tools: Tool[],
    modifiers?: SessionMetaToolOptions
  ): Promise<Tool[]> {
    const customTools = await this.getPreloadedCustomToolSchemas(modifiers);
    if (!customTools.length) {
      return tools;
    }

    const existingSlugs = new Set(tools.map(tool => tool.slug.toUpperCase()));
    const appendedTools = customTools.filter(tool => !existingSlugs.has(tool.slug.toUpperCase()));
    if (!appendedTools.length) {
      return tools;
    }

    return [...tools, ...appendedTools];
  }

  private async getPreloadedCustomToolSchemas(modifiers?: SessionMetaToolOptions): Promise<Tool[]> {
    if (!this.customToolsMap || !this.preloadedCustomToolSlugs.length) {
      return [];
    }

    const tools: Tool[] = [];
    for (const slug of this.preloadedCustomToolSlugs) {
      const entry = findCustomToolMapEntryByFinalSlug(this.customToolsMap, slug);
      if (!entry) {
        continue;
      }

      let tool = this.customToolEntryToTool(entry);
      if (modifiers?.modifySchema) {
        tool = await modifiers.modifySchema({
          toolSlug: tool.slug,
          toolkitSlug: tool.toolkit?.slug ?? 'custom',
          schema: tool,
        });
      }
      tools.push(tool);
    }
    return tools;
  }

  private customToolEntryToTool(entry: CustomToolsMapEntry): Tool {
    const toolkitSlug = entry.toolkit ?? 'custom';
    const customToolkit = this.customToolsMap?.toolkits?.find(
      toolkit => toolkit.slug.toLowerCase() === toolkitSlug.toLowerCase()
    );
    const toolkitName = customToolkit?.name ?? entry.toolkit ?? 'Custom';

    return {
      slug: entry.finalSlug,
      name: entry.handle.name,
      description: `${DIRECT_CUSTOM_TOOL_DESCRIPTION_PREFIX}\n${entry.handle.description}`,
      inputParameters: entry.handle.inputSchema as Tool['inputParameters'],
      outputParameters: entry.handle.outputSchema as Tool['outputParameters'],
      tags: [],
      toolkit: {
        slug: toolkitSlug,
        name: toolkitName,
      },
      isDeprecated: false,
      availableVersions: [],
      scopes: [],
      isNoAuth: !entry.handle.extendsToolkit,
    };
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
        // Look up by toolkit + original slug so toolkits can safely reuse common names
        // like VERSION, CLICK, or SEARCH without losing the backend-assigned final slug.
        const entry =
          findCustomToolMapEntryByToolkitAndOriginalSlug(this.customToolsMap, tk.slug, tool.slug) ??
          this.customToolsMap!.byOriginalSlug.get(tool.slug.toUpperCase());
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
   *
   * Use `accountType` and `aclConfigForShared` to create a SHARED connection
   * with a per-user ACL in one flow. Default behaviour (omit both) creates
   * a PRIVATE connection.
   *
   * `aclConfigForShared` is validated against the same caps as
   * `composio.connectedAccounts.link()` (≤1000 entries per list, each
   * `userId` 1..256 characters). Invalid input throws `ValidationError`
   * at the SDK boundary.
   */
  async authorize(
    toolkit: string,
    options?: {
      callbackUrl?: string;
      alias?: string;
      accountType?: ConnectedAccountType;
      aclConfigForShared?: ConnectedAccountAclConfig;
    }
  ): Promise<ConnectionRequest> {
    const requestOptions = AuthorizeOptionsSchema.safeParse(options ?? {});
    if (!requestOptions.success) {
      throw new ValidationError('Failed to parse tool router authorize options', {
        cause: requestOptions.error,
      });
    }
    const opts = requestOptions.data;
    const aclWire: SessionLinkParams.ACLConfigForShared | undefined =
      opts.aclConfigForShared === undefined
        ? undefined
        : {
            ...(opts.aclConfigForShared.allowAllUsers !== undefined && {
              allow_all_users: opts.aclConfigForShared.allowAllUsers,
            }),
            ...(opts.aclConfigForShared.allowedUserIds !== undefined && {
              allowed_user_ids: opts.aclConfigForShared.allowedUserIds,
            }),
            ...(opts.aclConfigForShared.notAllowedUserIds !== undefined && {
              not_allowed_user_ids: opts.aclConfigForShared.notAllowedUserIds,
            }),
          };
    const body: SessionLinkParams = {
      toolkit,
      ...(opts.callbackUrl !== undefined && { callback_url: opts.callbackUrl }),
      ...(opts.alias !== undefined && { alias: opts.alias }),
      ...(opts.accountType !== undefined && { account_type: opts.accountType }),
      ...(aclWire !== undefined && { acl_config_for_shared: aclWire }),
    };

    let response;
    try {
      response = await this.client.toolRouter.session.link(this.sessionId, body);
    } catch (error) {
      // The server rejects ACL on PRIVATE connections — surface that as a
      // typed error mirroring `composio.connectedAccounts.link()`.
      if (
        error instanceof BadRequestError &&
        typeof error.message === 'string' &&
        error.message.includes('acl_config_for_shared is only valid on SHARED')
      ) {
        throw new ComposioAclOnlyForSharedError(error.message, { cause: error });
      }
      throw error;
    }

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
      cursor: toolkitOptions.data.cursor,
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
      cursor: result.next_cursor ?? undefined,
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
    const experimental = inlineCustomToolsExperimental<SessionSearchParams.Experimental>(
      this.inlineCustomToolsPayload
    );
    const searchParams = {
      queries: [{ use_case: params.query }],
      ...(params.toolkits?.length ? { toolkits: params.toolkits } : {}),
      ...(experimental ? { experimental } : {}),
    };
    const response = await this.client.toolRouter.session.search(this.sessionId, searchParams);
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
   * @param options - Optional execution options
   * @param options.account - Account identifier for direct app tool execution in multi-account sessions. Helper/meta tools either ignore this top-level field or define their own account-selection fields.
   * @returns The tool execution result
   */
  async execute(
    toolSlug: string,
    arguments_?: Record<string, unknown>,
    options?: ToolRouterSessionExecuteOptions
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
    assertUnambiguousCustomToolSlug(this.customToolsMap, toolSlug);

    // Remote execution
    const executeParams: SessionExecuteParams = {
      tool_slug: toolSlug,
      arguments: arguments_ ?? {},
    };
    if (options?.account) {
      executeParams.account = options.account;
    }
    const experimental = inlineCustomToolsExperimental<SessionExecuteParams.Experimental>(
      this.inlineCustomToolsPayload
    );
    if (experimental) {
      executeParams.experimental = experimental;
    }

    const response = await this.client.toolRouter.session.execute(this.sessionId, executeParams);
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
  async proxyExecute(
    params: SessionProxyExecuteParams
  ): Promise<ToolRouterSessionProxyExecuteResponse> {
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
      ...(response.binary_data
        ? {
            binaryData: {
              contentType: response.binary_data.content_type,
              size: response.binary_data.size,
              url: response.binary_data.url,
              expiresAt: response.binary_data.expires_at,
            },
          }
        : {}),
    };
  }

  /**
   * Partially update the session configuration.
   * Only the fields provided will be changed; omitted fields are preserved.
   * Mutates this session's `configVersion`, `preload`, and `warnings` in-place.
   */
  async update(config: ToolRouterUpdateSessionConfig): Promise<void> {
    const parsed = ToolRouterUpdateSessionConfigSchema.parse(config);
    const params = transformToolRouterUpdateParams(parsed);
    const response = await this.client.toolRouter.session.patch(this.sessionId, params);
    this.configVersion = response.config_version;
    this.preload = response.config.preload;
    this.warnings = response.warnings ?? [];
  }

  // ── Private helpers ──────────────────────────────────────────

  /** Check if this session has any custom tools bound. */
  private hasCustomTools(): boolean {
    return (this.customToolsMap?.byFinalSlug.size ?? 0) > 0;
  }

  private executeBackendSessionTool(
    ToolsModel: Tools<TToolCollection, TTool, TProvider>,
    toolSlug: string,
    input: Record<string, unknown>,
    modifiers?: SessionMetaToolOptions,
    tool?: Tool
  ): Promise<ToolExecuteResponse> {
    const body = { sessionId: this.sessionId, arguments: input };
    const experimental = inlineCustomToolsExperimental<SessionExecuteParams.Experimental>(
      this.inlineCustomToolsPayload
    );
    if (experimental) {
      return ToolsModel.executeSessionTool(toolSlug, body, modifiers, tool, { experimental });
    }
    return ToolsModel.executeSessionTool(toolSlug, body, modifiers, tool);
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
    tools: Tool[],
    modifiers?: SessionMetaToolOptions
  ): Promise<ToolExecuteResponse> {
    const multiExecuteTool = tools.find(tool => tool.slug === COMPOSIO_MULTI_EXECUTE_TOOL);
    const toolItems = input.tools as unknown[];
    if (!Array.isArray(toolItems) || toolItems.length === 0) {
      // Fallback: send to backend as-is
      return this.executeBackendSessionTool(
        ToolsModel,
        COMPOSIO_MULTI_EXECUTE_TOOL,
        input,
        modifiers,
        multiExecuteTool
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
        assertUnambiguousCustomToolSlug(this.customToolsMap, parsed[i].tool_slug);
        remoteIndices.push(i);
      }
    }

    // All remote — just forward entire payload
    if (localItems.length === 0) {
      return this.executeBackendSessionTool(
        ToolsModel,
        COMPOSIO_MULTI_EXECUTE_TOOL,
        input,
        modifiers,
        multiExecuteTool
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
      remotePromise = this.executeBackendSessionTool(
        ToolsModel,
        COMPOSIO_MULTI_EXECUTE_TOOL,
        remoteInput,
        modifiers,
        multiExecuteTool
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
    const remoteData = (
      remoteResult?.data &&
      typeof remoteResult.data === 'object' &&
      !Array.isArray(remoteResult.data)
        ? remoteResult.data
        : {}
    ) as Record<string, unknown>;
    const remoteResults = (
      Array.isArray(remoteData.results) ? remoteData.results : []
    ) as unknown[];

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
    const allResults = merged.map(
      (entry, i): Record<string, unknown> => ({
        ...entry,
        index: i,
      })
    );
    const failedCount = allResults.filter(r => r.error).length;
    const mergedData: Record<string, unknown> = {
      ...remoteData,
      results: allResults,
    };
    if (
      localEntries.length > 0 &&
      ['total_count', 'success_count', 'error_count'].some(key => key in remoteData)
    ) {
      mergedData.total_count = allResults.length;
      mergedData.success_count = allResults.length - failedCount;
      mergedData.error_count = failedCount;
    }
    const remoteError = typeof remoteResult?.error === 'string' ? remoteResult.error : null;
    const hasAnyError = localResults.some(r => r.result.error) || !!remoteError;

    return {
      data: mergedData,
      error: hasAnyError
        ? remoteError && failedCount === 0
          ? remoteError
          : `${failedCount} out of ${allResults.length} tools failed`
        : null,
      successful: !hasAnyError,
    };
  }
}
