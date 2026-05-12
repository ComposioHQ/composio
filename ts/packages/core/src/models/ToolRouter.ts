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
  ToolRouterSessionMetadata,
  SessionPreset,
} from '../types/toolRouter.types';
import { ToolRouterCreateSessionConfigSchema } from '../types/toolRouter.types';
import {
  SessionAttachResponse,
  SessionCreateParams,
  SessionCreateResponse,
  SessionRetrieveResponse,
} from '@composio/client/resources/tool-router/session/session.mjs';
import type {
  CustomTool,
  CustomToolkit,
  InlineCustomToolsWirePayload,
} from '../types/customTool.types';
import {
  transformToolRouterTagsParams,
  transformToolRouterToolsParams,
  transformToolRouterManageConnectionsParams,
  transformToolRouterWorkbenchParams,
  transformToolRouterToolkitsParams,
  transformToolRouterMultiAccountParams,
} from '../lib/toolRouterParams';
import { PRELOAD_TOOLS_ALL } from '../lib/toolRouterConstants';
import { ToolRouterSession } from './ToolRouterSession';
import {
  assertNoCustomToolSlugsInPreload,
  buildCustomToolsMap,
  buildCustomToolsMapFromResponse,
  getPreloadedCustomToolSlugs,
  serializeCustomTools,
  serializeCustomToolkits,
} from './CustomTool';
import type { CustomToolsMap } from '../types/customTool.types';

function getSessionMetadata(
  session: SessionCreateResponse | SessionRetrieveResponse | SessionAttachResponse
) {
  const metadata: ToolRouterSessionMetadata = {
    preload: session.config.preload,
    configVersion: session.config_version,
    warnings: 'warnings' in session ? (session.warnings ?? []) : [],
  };
  return metadata;
}

function preloadsAllCustomTools(preload?: { tools?: readonly string[] | string }): boolean {
  return preload?.tools === PRELOAD_TOOLS_ALL;
}

function prepareInlineCustomTools(options: {
  customTools?: CustomTool[];
  customToolkits?: CustomToolkit[];
  defaultPreload?: boolean;
  preloadTools?: readonly string[] | typeof PRELOAD_TOOLS_ALL;
}): InlineCustomToolsWirePayload | undefined {
  const { customTools, customToolkits, defaultPreload = false, preloadTools } = options;
  const hasCustoms = !!(customTools?.length || customToolkits?.length);
  const localCustomToolsMap = hasCustoms
    ? buildCustomToolsMap(customTools ?? [], customToolkits)
    : undefined;

  // Top-level preload.tools is for Composio-managed slugs only. Custom tools
  // use their own preload flag, so reject LOCAL/custom slugs there before
  // serializing the inline custom definitions.
  assertNoCustomToolSlugsInPreload(preloadTools, localCustomToolsMap);

  const serializedTools = customTools?.length
    ? serializeCustomTools(customTools, { defaultPreload })
    : undefined;
  const serializedToolkits = customToolkits?.length
    ? serializeCustomToolkits(customToolkits, { defaultPreload })
    : undefined;

  const inlineCustomToolsPayload =
    serializedTools || serializedToolkits
      ? {
          ...(serializedTools ? { custom_tools: serializedTools } : {}),
          ...(serializedToolkits ? { custom_toolkits: serializedToolkits } : {}),
        }
      : undefined;

  return inlineCustomToolsPayload;
}

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
   * Use `sessionPreset: SessionPreset.DIRECT_TOOLS` when all needed tools
   * should be exposed directly; see `ToolRouterCreateSessionConfig`.
   *
   * @param userId {string} The user id to create the session for
   * @param config {ToolRouterCreateSessionConfig} The config for the tool router session
   * @returns {Promise<Session<TToolCollection, TTool, TProvider>>} The tool router session
   *
   * @example
   * ```typescript
   * import { Composio } from '@composio/core';
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
    const isDirectToolsPreset = routerConfig.sessionPreset === SessionPreset.DIRECT_TOOLS;

    // Extract custom tools/toolkits from experimental config
    const customTools = routerConfig.experimental?.customTools;
    const customToolkits = routerConfig.experimental?.customToolkits;
    const defaultCustomPreload = preloadsAllCustomTools(routerConfig.preload);
    const inlineCustomToolsPayload = prepareInlineCustomTools({
      customTools,
      customToolkits,
      defaultPreload: defaultCustomPreload,
      preloadTools: routerConfig.preload?.tools,
    });

    // Build the typed experimental payload for the backend
    const experimentalPayload: SessionCreateParams['experimental'] = {};

    if (routerConfig.experimental?.assistivePrompt?.userTimezone) {
      experimentalPayload.assistive_prompt_config = {
        user_timezone: routerConfig.experimental.assistivePrompt.userTimezone,
      };
    }

    if (inlineCustomToolsPayload?.custom_tools) {
      experimentalPayload.custom_tools = inlineCustomToolsPayload.custom_tools;
    }
    if (inlineCustomToolsPayload?.custom_toolkits) {
      experimentalPayload.custom_toolkits = inlineCustomToolsPayload.custom_toolkits;
    }

    const multiAccountPayload = transformToolRouterMultiAccountParams(routerConfig.multiAccount);

    const connectedAccountsPayload =
      routerConfig.connectedAccounts === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(routerConfig.connectedAccounts).map(([toolkit, ids]) => [
              toolkit,
              typeof ids === 'string' ? [ids] : ids,
            ])
          );

    const payload: SessionCreateParams = {
      user_id: userId,
      auth_configs: routerConfig.authConfigs,
      connected_accounts: connectedAccountsPayload,
      toolkits: transformToolRouterToolkitsParams(routerConfig.toolkits),
      tools: transformToolRouterToolsParams(routerConfig.tools),
      tags: transformToolRouterTagsParams(routerConfig.tags),
      manage_connections: transformToolRouterManageConnectionsParams(
        routerConfig.manageConnections
      ),
      workbench: transformToolRouterWorkbenchParams(routerConfig.workbench),
      multi_account: multiAccountPayload,
      preload: routerConfig.preload,
      ...(isDirectToolsPreset && {
        search: { enable: false },
        execute: { enable_multi_execute: false },
      }),
      experimental: Object.keys(experimentalPayload).length > 0 ? experimentalPayload : undefined,
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
    const metadata = {
      ...getSessionMetadata(session),
      preloadedCustomToolSlugs: getPreloadedCustomToolSlugs(customToolsMap, defaultCustomPreload),
      inlineCustomToolsPayload,
    };

    const assistivePrompt = session.experimental?.assistive_prompt;

    return new ToolRouterSession<TToolCollection, TTool, TProvider>(
      this.client,
      this.config,
      session.session_id,
      this.createMCPServerConfig(session.mcp),
      { assistivePrompt },
      customToolsMap,
      userId,
      metadata
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
  async use(
    id: string,
    options?: { customTools?: CustomTool[]; customToolkits?: CustomToolkit[] }
  ): Promise<Session<TToolCollection, TTool, TProvider>> {
    const customTools = options?.customTools;
    const customToolkits = options?.customToolkits;
    const hasCustoms = !!(customTools?.length || customToolkits?.length);

    let session: SessionRetrieveResponse | SessionAttachResponse;
    const attachInlineCustomToolsPayload = prepareInlineCustomTools({
      customTools,
      customToolkits,
    });
    let inlineCustomToolsPayload = attachInlineCustomToolsPayload;

    if (hasCustoms) {
      session = await this.client.toolRouter.session.attach(id, {
        experimental: attachInlineCustomToolsPayload,
      });
    } else {
      session = await this.client.toolRouter.session.retrieve(id);
    }

    const defaultCustomPreload = preloadsAllCustomTools(session.config.preload);
    if (hasCustoms && defaultCustomPreload) {
      // preload.tools = "all" on the existing session is server-authoritative:
      // the backend exposes every custom tool regardless of per-definition
      // preload flags, so the initial attach above (which used the caller's
      // explicit hints) doesn't need re-sending. We only rebuild the in-memory
      // payload so future search/execute calls re-inject with preload=true and
      // session.tools() locally mirrors what the server returns.
      inlineCustomToolsPayload = prepareInlineCustomTools({
        customTools,
        customToolkits,
        defaultPreload: true,
      });
    }

    let customToolsMap: CustomToolsMap | undefined;
    let userId: string | undefined;
    if (hasCustoms) {
      customToolsMap = buildCustomToolsMapFromResponse(
        customTools ?? [],
        customToolkits,
        session.experimental
      );
      userId = session.config.user_id;
    }

    const metadata = {
      ...getSessionMetadata(session),
      preloadedCustomToolSlugs: getPreloadedCustomToolSlugs(customToolsMap, defaultCustomPreload),
      inlineCustomToolsPayload,
    };

    return new ToolRouterSession<TToolCollection, TTool, TProvider>(
      this.client,
      this.config,
      session.session_id,
      this.createMCPServerConfig(session.mcp),
      undefined,
      customToolsMap,
      userId,
      metadata
    );
  }
}
