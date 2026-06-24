import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

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

export interface PiHookControls {
  /** Return from a hook to explicitly deny/divert the operation with a model-visible error. */
  deny(error: string): PiDeniedResult;
}

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

export const DEFAULT_SESSION_TOOL_NAMES = {
  search: 'composio_search_tools',
  manageConnections: 'composio_manage_connections',
  execute: 'composio_execute_tool',
  remoteWorkbench: 'composio_remote_workbench',
  remoteBash: 'composio_remote_bash',
} as const;

export type PiSessionToolName = keyof typeof DEFAULT_SESSION_TOOL_NAMES;

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
