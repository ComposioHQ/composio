/**
 * Pi Provider
 *
 * Experimental provider for @earendil-works/pi-coding-agent.
 *
 * The provider has two layers:
 * - `wrapTool` / `wrapTools` adapt concrete Composio tools into Pi custom tools.
 * - `createSessionTools` creates Slack-bot-style dynamic Composio helpers
 *   (`composio_search_tools`, `composio_manage_connections`, `composio_execute_tool`),
 *   plus optional first-class remote workbench helpers, from app-provided
 *   search / execute / connection-management capabilities.
 *
 * @packageDocumentation
 * @module experimental
 */
import {
  BaseAgenticProvider,
  type ExecuteToolFn,
  type McpServerGetResponse,
  type McpUrlResponse,
  normalizeToolArguments,
  type Tool as ComposioTool,
  type ToolExecuteResponse,
} from '@composio/core';
import {
  defineTool,
  type AgentToolResult,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type, type Static, type TSchema } from 'typebox';

export type PiToolDetails = {
  slug?: string;
  result?: unknown;
  error?: string | null;
  authLinks?: string[];
  denied?: boolean;
};

export type PiTool = ToolDefinition;
export type PiToolCollection = PiTool[];

export type PiToolResultFormatter = (result: unknown) => string;

export type PiDeniedResult = {
  successful: false;
  error: string;
  data: null;
  denied: true;
};

export const denyPiToolCall = (error: string): PiDeniedResult => ({
  successful: false,
  error,
  data: null,
  denied: true,
});

export interface PiHookControls {
  /** Return from a hook to explicitly deny/divert the operation with a model-visible error. */
  deny(error: string): PiDeniedResult;
}

const hookControls: PiHookControls = {
  deny: denyPiToolCall,
};

export type MaybePromise<T> = T | Promise<T>;

export type PiHookNext<TResult> = () => Promise<TResult>;

export interface PiProviderOptions {
  /** Prefix shown in Pi's TUI labels. Defaults to `Composio`. */
  labelPrefix?: string;
  /** Per-tool execution mode. Defaults to Pi's runtime default. */
  executionMode?: PiTool['executionMode'];
  /** Convert Composio results to the text sent back to the model. */
  formatResult?: PiToolResultFormatter;
  /** Return thrown errors as structured JSON instead of rethrowing to Pi. Defaults to true. */
  catchErrors?: boolean;
}

const DEFAULT_SESSION_TOOL_NAMES = {
  search: 'composio_search_tools',
  manageConnections: 'composio_manage_connections',
  execute: 'composio_execute_tool',
  remoteWorkbench: 'composio_remote_workbench',
  remoteBash: 'composio_remote_bash',
} as const;

type PiSessionToolName = keyof typeof DEFAULT_SESSION_TOOL_NAMES;

export interface PiBaseToolContext {
  /** Tool call id passed by Pi. */
  toolCallId: string;
  /** The Pi helper tool that is currently running. */
  sourceTool: string;
  /** Optional Composio Tool Router session id for prompts/logging/default workbench session ids. */
  sessionId?: string;
  /** Original helper request sent by the model. */
  originalRequest: unknown;
}

export interface PiSearchContext extends PiBaseToolContext {
  query: string;
  requestedToolkits?: string[];
}

export interface PiConnectionManagementContext extends PiBaseToolContext {
  requestedToolkits: string[];
  callbackUrl?: string;
  reinitiateAll: boolean;
}

export interface PiExecuteContext extends PiBaseToolContext {
  toolSlug: string;
  toolkit?: string;
  args: Record<string, unknown>;
  account?: string;
}

export interface PiAuthLinkContext<TResult = unknown> extends PiHookControls {
  url: string;
  toolkit?: string;
  sourceTool: string;
  originalRequest: unknown;
  result: TResult;
  sessionId?: string;
}

export interface PiSessionToolOptions extends PiProviderOptions {
  /** Callback URL passed to `authorizeToolkit()` when connection management initiates auth. */
  callbackUrl?: string;
  /** Include first-class wrappers for COMPOSIO_REMOTE_WORKBENCH and COMPOSIO_REMOTE_BASH_TOOL. Defaults to false. */
  includeWorkbenchTools?: boolean;
  /** Override the default helper tool names. */
  names?: Partial<typeof DEFAULT_SESSION_TOOL_NAMES>;
  /** Called before a result is returned to Pi; useful for redacting or routing auth links. */
  transformResult?: (params: {
    tool: PiSessionToolName;
    requestedToolkits?: string[];
    value: unknown;
    context?: PiBaseToolContext;
  }) => unknown | Promise<unknown>;
}

export interface PiComposioSessionLike<
  TSearchResult = unknown,
  TExecuteResult = unknown,
  TToolkitStates = unknown,
  TAuthorizeResult = unknown,
> {
  sessionId?: string;
  search(params: { query: string; toolkits?: string[] }): Promise<TSearchResult>;
  execute(
    toolSlug: string,
    args?: Record<string, unknown>,
    options?: { account?: string }
  ): Promise<TExecuteResult>;
  /** Native Tool Router connection-state API. Preferred over executing a meta tool. */
  toolkits?(options?: {
    toolkits?: string[];
    isConnected?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<TToolkitStates>;
  authorize?(
    toolkit: string,
    options?: { callbackUrl?: string; alias?: string; experimental?: unknown }
  ): Promise<TAuthorizeResult>;
}

export interface PiExecutableSessionLike<TExecuteResult = unknown> {
  sessionId?: string;
  execute(
    toolSlug: string,
    args?: Record<string, unknown>,
    options?: { account?: string }
  ): Promise<TExecuteResult>;
}

export type PiSearchHandler<TSearchResult = unknown> = (
  params: { query: string; toolkits?: string[] },
  context: PiSearchContext
) => MaybePromise<TSearchResult>;

export type PiExecuteHandler<TExecuteResult = unknown> = (
  toolSlug: string,
  args: Record<string, unknown>,
  options: { account?: string } | undefined,
  context: PiExecuteContext
) => MaybePromise<TExecuteResult>;

export interface PiAuthorizeToolkitOptions {
  callbackUrl?: string;
  alias?: string;
  experimental?: unknown;
  reinitiate?: boolean;
}

export interface PiConnectionHandlers<
  TState = unknown,
  TAuthorizeResult = unknown,
  TToolkitStates = unknown,
> {
  /** Return connection states for the requested toolkits, e.g. from `session.toolkits({ toolkits })`. */
  getToolkitStates?: (
    toolkits: string[],
    context: PiConnectionManagementContext
  ) => MaybePromise<TToolkitStates>;
  /** Start auth for one toolkit, e.g. via `session.authorize(toolkit, { callbackUrl })`. */
  authorizeToolkit?: (
    toolkit: string,
    options: PiAuthorizeToolkitOptions,
    context: PiConnectionManagementContext
  ) => Promise<TAuthorizeResult> | TAuthorizeResult;
  /** Interpret one state returned by `getToolkitStates()`. Defaults handle common Tool Router shapes. */
  isConnected?: (
    state: TState,
    context: { toolkit: string; request: PiConnectionManagementContext }
  ) => boolean;
}

export interface PiSearchHookContext extends PiHookControls {
  request: { query: string; toolkits?: string[] };
  context: PiSearchContext;
}

export interface PiManageConnectionsHookContext extends PiHookControls {
  request: { toolkits: string[]; reinitiateAll: boolean };
  context: PiConnectionManagementContext;
}

export interface PiExecuteHookContext<TExecuteResult = unknown> extends PiHookControls {
  request: {
    toolSlug: string;
    args: Record<string, unknown>;
    account?: string;
    session?: PiExecutableSessionLike<TExecuteResult>;
    execute?: PiExecuteHandler<TExecuteResult>;
  };
  context: PiExecuteContext;
  manageConnections: (
    toolkits: string[],
    options?: { reinitiateAll?: boolean }
  ) => Promise<unknown>;
}

export interface PiRemoteWorkbenchRequest extends Record<string, unknown> {
  code_to_execute: string;
  timeout?: number;
  thought?: string;
  file_path?: string;
  disabled_tools?: string[];
  session_id?: string;
}

export interface PiRemoteBashRequest extends Record<string, unknown> {
  command: string;
  session_id?: string;
}

export interface PiRemoteWorkbenchHookContext extends PiHookControls {
  request: PiRemoteWorkbenchRequest;
  context: PiExecuteContext;
}

export interface PiRemoteBashHookContext extends PiHookControls {
  request: PiRemoteBashRequest;
  context: PiExecuteContext;
}

export interface PiSessionHooks<
  TSearchResult = unknown,
  TExecuteResult = unknown,
  TState = unknown,
  TAuthorizeResult = unknown,
> {
  /** Middleware around search. Mutate `ctx.request`, call `next()` to run search, or return a replacement result. */
  search?: (ctx: PiSearchHookContext, next: PiHookNext<TSearchResult>) => MaybePromise<unknown>;
  /** Middleware around connection management. Mutate `ctx.request`, call `next()` to check/connect, or return a replacement result. */
  manageConnections?: (
    ctx: PiManageConnectionsHookContext,
    next: PiHookNext<PiConnectionManagementResult<TState, TAuthorizeResult>>
  ) => MaybePromise<unknown>;
  /** Middleware around tool execution. Mutate `ctx.request`, call `next()` to execute, or return a replacement result. */
  execute?: (
    ctx: PiExecuteHookContext<TExecuteResult>,
    next: PiHookNext<TExecuteResult>
  ) => MaybePromise<unknown>;
  /** Middleware around the remote Python workbench helper. Runs outside, then through, the generic `execute` hook when `next()` is called. */
  remoteWorkbench?: (
    ctx: PiRemoteWorkbenchHookContext,
    next: PiHookNext<TExecuteResult>
  ) => MaybePromise<unknown>;
  /** Middleware around the remote bash helper. Runs outside, then through, the generic `execute` hook when `next()` is called. */
  remoteBash?: (
    ctx: PiRemoteBashHookContext,
    next: PiHookNext<TExecuteResult>
  ) => MaybePromise<unknown>;
  /** Middleware for auth links found in any result. Call `next()` to keep the current model-visible result, or return a replacement. */
  onAuthLink?: (
    ctx: PiAuthLinkContext<TSearchResult | TExecuteResult | TAuthorizeResult>,
    next: PiHookNext<TSearchResult | TExecuteResult | TAuthorizeResult>
  ) => MaybePromise<unknown>;
}

export interface PiSessionToolCapabilities<
  TSearchResult = unknown,
  TExecuteResult = unknown,
  TState = unknown,
  TAuthorizeResult = unknown,
  TToolkitStates = unknown,
> extends PiSessionToolOptions {
  /** Optional session id for prompt context and default workbench session ids. */
  sessionId?: string;
  search: PiSearchHandler<TSearchResult>;
  execute: PiExecuteHandler<TExecuteResult>;
  connections?: PiConnectionHandlers<TState, TAuthorizeResult, TToolkitStates>;
  hooks?: PiSessionHooks<TSearchResult, TExecuteResult, TState, TAuthorizeResult>;
}

export type PiConnectionToolkitResult<TState = unknown, TAuthorizeResult = unknown> = {
  toolkit: string;
  connected: boolean;
  status: 'connected' | 'auth_initiated' | 'missing_authorize_handler';
  state?: TState;
  authorization?: TAuthorizeResult;
  authLinks?: string[];
};

export type PiConnectionManagementResult<TState = unknown, TAuthorizeResult = unknown> = {
  successful: true;
  data: {
    message: string;
    results: Record<string, PiConnectionToolkitResult<TState, TAuthorizeResult>>;
  };
  error: null;
};

const defaultFormatResult: PiToolResultFormatter = result => JSON.stringify(result, null, 2);

const EmptyObjectSchema = Type.Object({});

const ToolkitsSchema = Type.Optional(
  Type.Array(Type.String({ description: 'Optional toolkit slug filter, e.g. github, gmail.' }))
);

const normalizeToolkits = (value: unknown): string[] | undefined => {
  const toolkits = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string' && value.trim().length > 0
      ? [value]
      : [];
  const unique = [...new Set(toolkits.map(toolkit => toolkit.trim()))];
  return unique.length > 0 ? unique : undefined;
};

const stringifyError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isPiDeniedResult = (value: unknown): value is PiDeniedResult =>
  !!value &&
  typeof value === 'object' &&
  (value as Partial<PiDeniedResult>).denied === true &&
  (value as Partial<PiDeniedResult>).successful === false;

const toPiResult = (
  value: unknown,
  formatter: PiToolResultFormatter,
  details: PiToolDetails = {}
): AgentToolResult<PiToolDetails> => ({
  content: [{ type: 'text' as const, text: formatter(value) }],
  details: {
    ...details,
    denied: details.denied ?? (isPiDeniedResult(value) ? true : undefined),
    result: value,
  },
});

const toPiErrorResult = (
  error: unknown,
  formatter: PiToolResultFormatter,
  details: PiToolDetails = {}
): AgentToolResult<PiToolDetails> => {
  const message = stringifyError(error);
  const value = {
    successful: false,
    error: message,
    data: null,
  };
  return {
    content: [{ type: 'text' as const, text: formatter(value) }],
    details: {
      ...details,
      error: message,
      result: value,
    },
  };
};

const objectInputSchema = (schema: ComposioTool['inputParameters'] | undefined): TSchema => {
  const candidate =
    schema && typeof schema === 'object'
      ? ({ ...schema } as Record<string, unknown>)
      : ({ ...EmptyObjectSchema } as Record<string, unknown>);
  if (!candidate.type) candidate.type = 'object';
  if (!candidate.properties) candidate.properties = {};
  if (candidate.additionalProperties === undefined) candidate.additionalProperties = true;
  return Type.Unsafe(candidate);
};

const optionalRecordSchema = (description: string) =>
  Type.Optional(Type.Record(Type.String(), Type.Any(), { description }));

const maybeTransform = async (
  options: Pick<PiSessionToolOptions, 'transformResult'>,
  params: Parameters<NonNullable<PiSessionToolOptions['transformResult']>>[0]
): Promise<unknown> => (options.transformResult ? options.transformResult(params) : params.value);

const defaultIsToolkitConnected = (state: unknown): boolean => {
  if (!state || typeof state !== 'object') return false;
  const record = state as Record<string, unknown>;
  if (record.isNoAuth === true || record.is_no_auth === true) return true;
  if (typeof record.isConnected === 'boolean') return record.isConnected;
  if (typeof record.is_connected === 'boolean') return record.is_connected;

  const connection = record.connection as Record<string, unknown> | undefined;
  if (connection) {
    if (connection.isActive === true || connection.is_active === true) return true;
    if (connection.status === 'ACTIVE') return true;
    const nestedConnectedAccount = connection.connectedAccount as
      | Record<string, unknown>
      | undefined;
    if (nestedConnectedAccount?.status === 'ACTIVE') return true;
    const nestedConnectedAccountSnake = connection.connected_account as
      | Record<string, unknown>
      | undefined;
    if (nestedConnectedAccountSnake?.status === 'ACTIVE') return true;
  }

  const connectedAccount = record.connectedAccount as Record<string, unknown> | undefined;
  if (connectedAccount?.status === 'ACTIVE') return true;
  const connectedAccountSnake = record.connected_account as Record<string, unknown> | undefined;
  if (connectedAccountSnake?.status === 'ACTIVE') return true;

  return false;
};

const toolkitKeyFromState = (state: unknown): string | undefined => {
  if (!state || typeof state !== 'object') return undefined;
  const record = state as Record<string, unknown>;
  const toolkit = record.toolkit as Record<string, unknown> | undefined;
  return (
    stringValue(record.slug) ??
    stringValue(record.toolkitSlug) ??
    stringValue(record.toolkit_slug) ??
    stringValue(record.name) ??
    stringValue(toolkit?.slug)
  );
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizeToolkitStateMap = (
  raw: unknown,
  requestedToolkits: string[]
): Map<string, unknown> => {
  const byToolkit = new Map<string, unknown>();
  const addState = (toolkit: string | undefined, state: unknown) => {
    if (toolkit) byToolkit.set(toolkit.toLowerCase(), state);
  };

  if (!raw) return byToolkit;

  if (Array.isArray(raw)) {
    raw.forEach((state, index) =>
      addState(toolkitKeyFromState(state) ?? requestedToolkits[index], state)
    );
    return byToolkit;
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      record.items.forEach((state, index) =>
        addState(toolkitKeyFromState(state) ?? requestedToolkits[index], state)
      );
      return byToolkit;
    }

    for (const toolkit of requestedToolkits) {
      if (record[toolkit] !== undefined) {
        addState(toolkit, record[toolkit]);
      }
    }

    if (byToolkit.size === 0 && requestedToolkits.length === 1) {
      addState(toolkitKeyFromState(raw) ?? requestedToolkits[0], raw);
    }
  }

  return byToolkit;
};

const formatDefaultConnectionResult = <TState, TAuthorizeResult>(
  results: Record<string, PiConnectionToolkitResult<TState, TAuthorizeResult>>
): PiConnectionManagementResult<TState, TAuthorizeResult> => {
  const missing = Object.values(results).filter(result => !result.connected).length;
  return {
    successful: true,
    data: {
      message:
        missing === 0
          ? 'All requested toolkits are connected.'
          : 'Connection flow initiated for missing toolkits.',
      results,
    },
    error: null,
  };
};

const runHook = async <TResult, TContext>(
  hook: ((ctx: TContext, next: PiHookNext<TResult>) => MaybePromise<unknown>) | undefined,
  context: TContext,
  getDefaultResult: () => MaybePromise<TResult>
): Promise<TResult | unknown> => {
  if (!hook) return getDefaultResult();

  const state: { nextResult?: Promise<TResult> } = {};
  const next = async (): Promise<TResult> => {
    state.nextResult ??= Promise.resolve(getDefaultResult());
    return state.nextResult;
  };

  const hookValue = await hook(context, next);
  if (hookValue !== undefined) return hookValue;
  return state.nextResult ?? next();
};

const applyAuthLinkHandlers = async (
  capabilities: PiSessionToolCapabilities,
  value: unknown,
  context: Omit<PiAuthLinkContext, 'url' | keyof PiHookControls>
): Promise<{ value: unknown; authLinks: string[] }> => {
  const links = extractComposioConnectLinks(value);
  const run = async (index: number, currentValue: unknown): Promise<unknown> => {
    const url = links[index];
    if (!url) return currentValue;
    return run(
      index + 1,
      await runHook(
        capabilities.hooks?.onAuthLink,
        { ...context, ...hookControls, url, result: currentValue },
        async () => currentValue
      )
    );
  };

  return { value: await run(0, value), authLinks: links };
};

const inferSessionConnections = (
  session: PiComposioSessionLike,
  options: PiSessionToolOptions
): PiConnectionHandlers | undefined => {
  if (!session.toolkits && !session.authorize) return undefined;
  return {
    getToolkitStates: session.toolkits
      ? toolkits => session.toolkits?.({ toolkits, limit: Math.max(toolkits.length, 1) })
      : undefined,
    authorizeToolkit: session.authorize
      ? (toolkit, authorizeOptions) =>
          session.authorize?.(toolkit, {
            callbackUrl: authorizeOptions.callbackUrl ?? options.callbackUrl,
            alias: authorizeOptions.alias,
            experimental: authorizeOptions.experimental,
          })
      : undefined,
  };
};

const isCapabilityInput = (
  value: PiComposioSessionLike | PiSessionToolCapabilities
): value is PiSessionToolCapabilities =>
  'connections' in value ||
  'hooks' in value ||
  'includeWorkbenchTools' in value ||
  'names' in value;

const toCapabilities = (
  input: PiComposioSessionLike | PiSessionToolCapabilities,
  providerOptions: PiProviderOptions,
  options: PiSessionToolOptions = {}
): PiSessionToolCapabilities => {
  if (isCapabilityInput(input)) {
    return {
      ...providerOptions,
      ...input,
      names: { ...(providerOptions as PiSessionToolOptions).names, ...(input.names ?? {}) },
    };
  }

  const mergedOptions = { ...providerOptions, ...options };
  return {
    ...mergedOptions,
    sessionId: input.sessionId,
    search: params => input.search(params),
    execute: (toolSlug, args, executeOptions) =>
      executeOptions
        ? input.execute(toolSlug, args, executeOptions)
        : input.execute(toolSlug, args),
    connections: inferSessionConnections(input, mergedOptions),
  };
};

/**
 * Provider for integrating Composio tools with Pi SDK custom tools.
 */
export class PiProvider extends BaseAgenticProvider<
  PiToolCollection,
  PiTool,
  McpServerGetResponse
> {
  readonly name = 'pi';

  constructor(private readonly options: PiProviderOptions = {}) {
    super();
  }

  /**
   * Wrap a concrete Composio tool as a Pi custom tool definition.
   */
  wrapTool(composioTool: ComposioTool, executeTool: ExecuteToolFn): PiTool {
    const formatter = this.options.formatResult ?? defaultFormatResult;
    const catchErrors = this.options.catchErrors ?? true;
    const schema = objectInputSchema(composioTool.inputParameters);

    return defineTool({
      name: composioTool.slug,
      label: `${this.options.labelPrefix ?? 'Composio'}: ${composioTool.name ?? composioTool.slug}`,
      description: composioTool.description ?? `Execute ${composioTool.slug} with Composio.`,
      promptSnippet: `Use ${composioTool.slug} for ${composioTool.description ?? composioTool.name ?? 'this Composio action'}.`,
      parameters: schema,
      ...(this.options.executionMode ? { executionMode: this.options.executionMode } : {}),
      prepareArguments: args =>
        normalizeToolArguments(args, composioTool.slug) as Static<typeof schema>,
      execute: async (_toolCallId, params) => {
        try {
          const args = normalizeToolArguments(params, composioTool.slug);
          const result = await executeTool(composioTool.slug, args);
          return toPiResult(result, formatter, {
            slug: composioTool.slug,
            error: (result as ToolExecuteResponse | undefined)?.error,
          });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: composioTool.slug });
        }
      },
    });
  }

  /**
   * Wrap multiple concrete Composio tools as Pi custom tools.
   */
  wrapTools(tools: ComposioTool[], executeTool: ExecuteToolFn): PiToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }

  createSessionTools<
    TSearchResult = unknown,
    TExecuteResult = unknown,
    TState = unknown,
    TAuthorizeResult = unknown,
    TToolkitStates = unknown,
  >(
    capabilities: PiSessionToolCapabilities<
      TSearchResult,
      TExecuteResult,
      TState,
      TAuthorizeResult,
      TToolkitStates
    >
  ): PiToolCollection;
  createSessionTools<
    TSearchResult = unknown,
    TExecuteResult = unknown,
    TToolkitStates = unknown,
    TAuthorizeResult = unknown,
  >(
    session: PiComposioSessionLike<TSearchResult, TExecuteResult, TToolkitStates, TAuthorizeResult>,
    options?: PiSessionToolOptions
  ): PiToolCollection;
  /**
   * Create Slack-bot-style dynamic Composio helpers.
   *
   * Prefer passing capabilities (`search`, `execute`, `connections`, `hooks`)
   * so app code owns auth, interception, and shared/service-session routing.
   * Passing a native Tool Router session is also supported; connection
   * management uses `session.toolkits()` + `session.authorize()` when present
   * and never executes `COMPOSIO_MANAGE_CONNECTIONS` internally.
   */
  // eslint-disable-next-line max-lines-per-function
  createSessionTools(
    input: PiComposioSessionLike | PiSessionToolCapabilities,
    options: PiSessionToolOptions = {}
  ): PiToolCollection {
    const capabilities = toCapabilities(input, this.options, options);
    const formatter = capabilities.formatResult ?? defaultFormatResult;
    const catchErrors = capabilities.catchErrors ?? true;
    const names = { ...DEFAULT_SESSION_TOOL_NAMES, ...(capabilities.names ?? {}) };
    const executionMode = capabilities.executionMode;

    const buildBaseContext = (
      toolCallId: string,
      sourceTool: (typeof DEFAULT_SESSION_TOOL_NAMES)[PiSessionToolName] | string,
      originalRequest: unknown
    ): PiBaseToolContext => ({
      toolCallId,
      sourceTool,
      sessionId: capabilities.sessionId,
      originalRequest,
    });

    const manageConnectionsForToolkits = async (
      toolCallId: string,
      originalRequest: unknown,
      toolkits: string[],
      reinitiateAll = false
    ): Promise<{
      value: unknown;
      authLinks: string[];
      context: PiConnectionManagementContext;
      denied?: boolean;
    }> => {
      const connectionContext: PiConnectionManagementContext = {
        ...buildBaseContext(toolCallId, names.manageConnections, originalRequest),
        requestedToolkits: toolkits,
        callbackUrl: capabilities.callbackUrl,
        reinitiateAll,
      };
      const hookContext: PiManageConnectionsHookContext = {
        ...hookControls,
        request: { toolkits, reinitiateAll },
        context: connectionContext,
      };
      const authLinks: string[] = [];

      const value = await runHook(capabilities.hooks?.manageConnections, hookContext, async () => {
        const requestedToolkits = normalizeToolkits(hookContext.request.toolkits) ?? [];
        const shouldReinitiateAll = hookContext.request.reinitiateAll;
        connectionContext.requestedToolkits = requestedToolkits;
        connectionContext.reinitiateAll = shouldReinitiateAll;

        const statesRaw = await capabilities.connections?.getToolkitStates?.(
          requestedToolkits,
          connectionContext
        );
        const states = normalizeToolkitStateMap(statesRaw, requestedToolkits);
        const results: Record<string, PiConnectionToolkitResult> = {};

        for (const toolkit of requestedToolkits) {
          const state = states.get(toolkit.toLowerCase());
          const connected = state
            ? (capabilities.connections?.isConnected?.(state, {
                toolkit,
                request: connectionContext,
              }) ?? defaultIsToolkitConnected(state))
            : false;

          if (connected && !shouldReinitiateAll) {
            results[toolkit] = {
              toolkit,
              connected: true,
              status: 'connected',
              state,
            };
            continue;
          }

          if (!capabilities.connections?.authorizeToolkit) {
            results[toolkit] = {
              toolkit,
              connected: false,
              status: 'missing_authorize_handler',
              state,
            };
            continue;
          }

          const authorization = await capabilities.connections.authorizeToolkit(
            toolkit,
            {
              callbackUrl: capabilities.callbackUrl,
              reinitiate: shouldReinitiateAll,
            },
            connectionContext
          );
          const handledAuthorization = await applyAuthLinkHandlers(capabilities, authorization, {
            ...connectionContext,
            toolkit,
            result: authorization,
          });
          authLinks.push(...handledAuthorization.authLinks);
          results[toolkit] = {
            toolkit,
            connected: false,
            status: 'auth_initiated',
            state,
            authorization: handledAuthorization.value,
          };
        }

        return formatDefaultConnectionResult(results);
      });

      return { value, authLinks, context: connectionContext };
    };

    const executeWithPolicy = async (
      toolCallId: string,
      sourceTool: (typeof DEFAULT_SESSION_TOOL_NAMES)[PiSessionToolName] | string,
      originalRequest: unknown,
      toolSlug: string,
      args: Record<string, unknown>,
      account?: string
    ): Promise<{
      value: unknown;
      authLinks: string[];
      context: PiExecuteContext;
      denied?: boolean;
    }> => {
      const executeContext: PiExecuteContext = {
        ...buildBaseContext(toolCallId, sourceTool, originalRequest),
        toolSlug,
        toolkit: toolkitFromToolSlug(toolSlug),
        args,
        account,
      };
      const authLinks: string[] = [];
      const hookContext: PiExecuteHookContext = {
        ...hookControls,
        request: { toolSlug, args, account },
        context: executeContext,
        manageConnections: async (managedToolkits, manageOptions) => {
          const managed = await manageConnectionsForToolkits(
            toolCallId,
            originalRequest,
            managedToolkits,
            manageOptions?.reinitiateAll
          );
          authLinks.push(...managed.authLinks);
          return managed.value;
        },
      };

      const value = await runHook(capabilities.hooks?.execute, hookContext, async () => {
        const finalToolSlug = hookContext.request.toolSlug;
        const finalArgs = hookContext.request.args;
        const finalAccount = hookContext.request.account;
        const finalContext: PiExecuteContext = {
          ...executeContext,
          toolSlug: finalToolSlug,
          toolkit: toolkitFromToolSlug(finalToolSlug),
          args: finalArgs,
          account: finalAccount,
        };
        hookContext.context = finalContext;

        const execute = hookContext.request.execute ?? capabilities.execute;
        const session = hookContext.request.session;
        const result = session
          ? await session.execute(
              finalToolSlug,
              finalArgs,
              finalAccount ? { account: finalAccount } : undefined
            )
          : await execute(
              finalToolSlug,
              finalArgs,
              finalAccount ? { account: finalAccount } : undefined,
              finalContext
            );
        const handledResult = await applyAuthLinkHandlers(capabilities, result, {
          ...finalContext,
          result,
        });
        authLinks.push(...handledResult.authLinks);
        return handledResult.value;
      });

      return { value, authLinks, context: hookContext.context };
    };

    const searchTools = defineTool({
      name: names.search,
      label: 'Composio Search Tools',
      description:
        'Search Composio for tools that can perform a requested action. Search globally by default; pass toolkits only when intentionally narrowing the search.',
      promptSnippet:
        'Use composio_search_tools to discover exact Composio tool slugs and schemas before executing app actions.',
      promptGuidelines: [
        'Search Composio before inventing tool slugs or arguments.',
        'Only pass a toolkit filter when you intentionally want to narrow search results.',
      ],
      parameters: Type.Object({
        query: Type.String({
          description: 'Natural language description of the action to perform.',
        }),
        toolkits: ToolkitsSchema,
      }),
      ...(executionMode ? { executionMode } : {}),
      execute: async (toolCallId, params) => {
        try {
          const requestedToolkits = normalizeToolkits(params.toolkits);
          const searchContext: PiSearchContext = {
            ...buildBaseContext(toolCallId, names.search, params),
            query: params.query,
            requestedToolkits,
          };
          const hookContext: PiSearchHookContext = {
            ...hookControls,
            request: {
              query: params.query,
              ...(requestedToolkits ? { toolkits: requestedToolkits } : {}),
            },
            context: searchContext,
          };
          const authLinks: string[] = [];
          const value = await runHook(capabilities.hooks?.search, hookContext, async () => {
            const toolkits = normalizeToolkits(hookContext.request.toolkits);
            hookContext.context.query = hookContext.request.query;
            hookContext.context.requestedToolkits = toolkits;
            const result = await capabilities.search(
              {
                query: hookContext.request.query,
                ...(toolkits ? { toolkits } : {}),
              },
              hookContext.context
            );
            const handledResult = await applyAuthLinkHandlers(capabilities, result, {
              ...hookContext.context,
              result,
            });
            authLinks.push(...handledResult.authLinks);
            return handledResult.value;
          });
          const transformed = await maybeTransform(capabilities, {
            tool: 'search',
            requestedToolkits: hookContext.context.requestedToolkits,
            value,
            context: hookContext.context,
          });
          return toPiResult(transformed, formatter, { slug: names.search, authLinks });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: names.search });
        }
      },
    });

    const manageConnections = defineTool({
      name: names.manageConnections,
      label: 'Composio Manage Connections',
      description:
        'Check whether the user has active connections for requested toolkits and initiate Composio auth when needed.',
      promptSnippet:
        'Use composio_manage_connections when a searched tool requires a missing app connection.',
      promptGuidelines: [
        'When an app connection is missing, call composio_manage_connections with the toolkit slug.',
        'Never ask the user for OAuth secrets or API keys directly.',
      ],
      parameters: Type.Object({
        toolkits: Type.Array(
          Type.String({ description: 'Toolkit slugs to check/connect, e.g. github, gmail.' })
        ),
        reinitiate_all: Type.Optional(
          Type.Boolean({ description: 'Force reconnection even if active connections exist.' })
        ),
      }),
      ...(executionMode ? { executionMode } : {}),
      execute: async (toolCallId, params) => {
        const toolkits = normalizeToolkits(params.toolkits) ?? [];
        try {
          const managed = await manageConnectionsForToolkits(
            toolCallId,
            params,
            toolkits,
            params.reinitiate_all ?? false
          );
          const transformed = await maybeTransform(capabilities, {
            tool: 'manageConnections',
            requestedToolkits: toolkits,
            value: managed.value,
            context: managed.context,
          });
          return toPiResult(transformed, formatter, {
            slug: names.manageConnections,
            authLinks: managed.authLinks,
            denied: managed.denied,
          });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: names.manageConnections });
        }
      },
    });

    const executeTool = defineTool({
      name: names.execute,
      label: 'Composio Execute Tool',
      description:
        'Execute an exact Composio tool slug using the configured Composio execution capability. Use search first so the slug and arguments match the schema.',
      promptSnippet:
        'Use composio_execute_tool to execute an exact Composio tool slug returned by composio_search_tools.',
      promptGuidelines: [
        'Always use exact tool slugs and schema-compliant arguments.',
        'For missing connections, use composio_manage_connections instead of asking for credentials.',
      ],
      parameters: Type.Object({
        toolSlug: Type.String({
          description: 'Exact Composio tool slug, e.g. GITHUB_CREATE_ISSUE.',
        }),
        arguments: optionalRecordSchema('Tool arguments matching the searched schema.'),
        account: Type.Optional(
          Type.String({
            description:
              'Optional account selector for multi-account sessions. Use connected account id or alias when required.',
          })
        ),
      }),
      ...(executionMode ? { executionMode } : {}),
      prepareArguments: args =>
        normalizeToolArguments(args, names.execute) as {
          toolSlug: string;
          arguments?: Record<string, unknown>;
          account?: string;
        },
      execute: async (toolCallId, params) => {
        const toolSlug = params.toolSlug.trim();
        const args = params.arguments ?? {};
        try {
          const executed = await executeWithPolicy(
            toolCallId,
            names.execute,
            params,
            toolSlug,
            args,
            params.account
          );
          const transformed = await maybeTransform(capabilities, {
            tool: 'execute',
            requestedToolkits: toolkitFromToolSlug(executed.context.toolSlug)
              ? [toolkitFromToolSlug(executed.context.toolSlug)!]
              : undefined,
            value: executed.value,
            context: executed.context,
          });
          return toPiResult(transformed, formatter, {
            slug: executed.context.toolSlug || names.execute,
            authLinks: executed.authLinks,
            denied: executed.denied,
          });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: toolSlug || names.execute });
        }
      },
    });

    if (!capabilities.includeWorkbenchTools) {
      return [searchTools, manageConnections, executeTool];
    }

    const remoteWorkbench = defineTool({
      name: names.remoteWorkbench,
      label: 'Composio Remote Workbench',
      description:
        'Execute Python code inside the Composio remote workbench for this Tool Router session. Use it for remote files, bulk processing, large tool outputs, and Composio-authenticated scripting.',
      promptSnippet:
        'Use composio_remote_workbench for Python scripting in the Composio remote sandbox when data is large, stored in remote files, or needs session-authenticated tool/proxy helpers.',
      promptGuidelines: [
        'Use composio_remote_workbench for large data processing or remote workbench files; do not use it for tiny inline transformations.',
        'Split long-running work into small cells and save checkpoints in the workbench filesystem.',
      ],
      parameters: Type.Object({
        code_to_execute: Type.String({
          description:
            'Python code to run in the persistent Composio remote workbench. Keep cells focused and avoid long-running jobs.',
        }),
        timeout: Type.Optional(
          Type.Number({
            minimum: 1,
            maximum: 780,
            description:
              'Maximum seconds to allow execution. Defaults to the session/backend workbench timeout.',
          })
        ),
        thought: Type.Optional(
          Type.String({ description: 'Concise objective for why this workbench cell is needed.' })
        ),
        file_path: Type.Optional(
          Type.String({
            description: 'Remote workbench path/glob to analyze when processing a file.',
          })
        ),
        disabled_tools: Type.Optional(
          Type.Array(Type.String({ description: 'Tool slugs to disable for this workbench call.' }))
        ),
        session_id: Type.Optional(
          Type.String({
            description:
              'Workbench workflow session id. Defaults to the Composio Tool Router session id.',
          })
        ),
      }),
      ...(executionMode ? { executionMode } : {}),
      execute: async (toolCallId, params) => {
        try {
          const request: PiRemoteWorkbenchRequest = {
            ...params,
            ...(params.session_id || capabilities.sessionId
              ? { session_id: params.session_id ?? capabilities.sessionId }
              : {}),
          };
          const hookContext: PiRemoteWorkbenchHookContext = {
            ...hookControls,
            request,
            context: {
              ...buildBaseContext(toolCallId, names.remoteWorkbench, params),
              toolSlug: 'COMPOSIO_REMOTE_WORKBENCH',
              args: request,
            },
          };
          const authLinks: string[] = [];
          const details: Pick<PiToolDetails, 'denied'> = {};
          const value = await runHook(
            capabilities.hooks?.remoteWorkbench,
            hookContext,
            async () => {
              const executed = await executeWithPolicy(
                toolCallId,
                names.remoteWorkbench,
                params,
                'COMPOSIO_REMOTE_WORKBENCH',
                hookContext.request
              );
              authLinks.push(...executed.authLinks);
              details.denied = executed.denied;
              hookContext.context = executed.context;
              return executed.value;
            }
          );
          const transformed = await maybeTransform(capabilities, {
            tool: 'remoteWorkbench',
            value,
            context: hookContext.context,
          });
          return toPiResult(transformed, formatter, {
            slug: hookContext.context.toolSlug,
            authLinks,
            denied: details.denied,
          });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: 'COMPOSIO_REMOTE_WORKBENCH' });
        }
      },
    });

    const remoteBash = defineTool({
      name: names.remoteBash,
      label: 'Composio Remote Bash',
      description:
        'Execute a bash command inside the Composio remote workbench for this Tool Router session.',
      promptSnippet:
        'Use composio_remote_bash to inspect or manipulate files in the Composio remote workbench filesystem.',
      promptGuidelines: [
        'Use composio_remote_bash for filesystem inspection in the remote workbench, especially for truncated output files.',
        'Keep commands short and non-interactive.',
      ],
      parameters: Type.Object({
        command: Type.String({
          description: 'Bash command to execute in the Composio remote workbench.',
        }),
        session_id: Type.Optional(
          Type.String({
            description:
              'Workbench workflow session id. Defaults to the Composio Tool Router session id.',
          })
        ),
      }),
      ...(executionMode ? { executionMode } : {}),
      execute: async (toolCallId, params) => {
        try {
          const request: PiRemoteBashRequest = {
            ...params,
            ...(params.session_id || capabilities.sessionId
              ? { session_id: params.session_id ?? capabilities.sessionId }
              : {}),
          };
          const hookContext: PiRemoteBashHookContext = {
            ...hookControls,
            request,
            context: {
              ...buildBaseContext(toolCallId, names.remoteBash, params),
              toolSlug: 'COMPOSIO_REMOTE_BASH_TOOL',
              args: request,
            },
          };
          const authLinks: string[] = [];
          const details: Pick<PiToolDetails, 'denied'> = {};
          const value = await runHook(capabilities.hooks?.remoteBash, hookContext, async () => {
            const executed = await executeWithPolicy(
              toolCallId,
              names.remoteBash,
              params,
              'COMPOSIO_REMOTE_BASH_TOOL',
              hookContext.request
            );
            authLinks.push(...executed.authLinks);
            details.denied = executed.denied;
            hookContext.context = executed.context;
            return executed.value;
          });
          const transformed = await maybeTransform(capabilities, {
            tool: 'remoteBash',
            value,
            context: hookContext.context,
          });
          return toPiResult(transformed, formatter, {
            slug: hookContext.context.toolSlug,
            authLinks,
            denied: details.denied,
          });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: 'COMPOSIO_REMOTE_BASH_TOOL' });
        }
      },
    });

    return [searchTools, manageConnections, executeTool, remoteWorkbench, remoteBash];
  }

  /**
   * Transform MCP URL responses into Pi-compatible standard URL entries.
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}

export const createPiComposioSystemPrompt = (
  sessionId?: string,
  options: { includeWorkbenchTools?: boolean } = {}
): string =>
  [
    "You have Composio tools for working across the user's connected apps.",
    'Use composio_search_tools to find the right tool before executing app actions.',
    'Use composio_manage_connections when an app is not connected; never ask for OAuth secrets or API keys.',
    'Use composio_execute_tool with exact tool slugs and schema-compliant arguments from search results.',
    options.includeWorkbenchTools
      ? 'Use composio_remote_workbench or composio_remote_bash for large outputs, remote files, or Composio-authenticated scripting in the remote workbench.'
      : undefined,
    sessionId ? `Composio session id: ${sessionId}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

export const extractComposioConnectLinks = (value: unknown): string[] => {
  const text = stringifyUnknown(value);
  const connectLinks = text.match(/https:\/\/connect\.composio\.dev\/[^\s<>)"']+/gi) ?? [];
  const genericLinks =
    text.match(/https:\/\/[^\s<>)"']*composio[^\s<>)"']*\/link\/[^\s<>)"']+/gi) ?? [];
  return [
    ...new Set([...connectLinks, ...genericLinks].map(url => url.replace(/[.,;:!?]+$/g, ''))),
  ];
};

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toolkitFromToolSlug = (toolSlug: string): string | undefined => {
  const normalized = toolSlug.trim().toLowerCase();
  if (!normalized || normalized.startsWith('composio_')) return undefined;

  const knownPrefixes: Array<[string, string]> = [
    ['google_calendar_', 'googlecalendar'],
    ['google_drive_', 'googledrive'],
    ['microsoft_teams_', 'microsoftteams'],
  ];
  for (const [prefix, toolkit] of knownPrefixes) {
    if (normalized.startsWith(prefix)) return toolkit;
  }

  const [prefix] = normalized.split('_');
  return prefix || undefined;
};

export { DEFAULT_SESSION_TOOL_NAMES as PI_COMPOSIO_SESSION_TOOL_NAMES };
