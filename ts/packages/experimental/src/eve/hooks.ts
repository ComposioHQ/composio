import type { ExecuteToolFn, ToolExecuteResponse } from '@composio/core';
import type { ToolContext } from 'eve/tools';
import { extractComposioConnectLinks } from '../auth-links';

type MaybePromise<T> = T | Promise<T>;
type Next = () => Promise<ToolExecuteResponse>;

export interface EveHookControls {
  deny(reason: string): ToolExecuteResponse;
}

export interface EveHookContext extends EveHookControls {
  request: { slug: string; args: Record<string, unknown> };
  readonly context: { readonly slug: string; readonly eve: ToolContext };
}

export interface EveAuthLinkContext extends EveHookControls {
  readonly url: string;
  readonly result: ToolExecuteResponse;
  readonly context: { readonly slug: string; readonly eve: ToolContext };
}

export type EveHook = (ctx: EveHookContext, next: Next) => MaybePromise<ToolExecuteResponse | void>;
export type EveAuthLinkHook = (
  ctx: EveAuthLinkContext,
  next: Next
) => MaybePromise<ToolExecuteResponse | void>;

export interface EveProviderHooks {
  search?: EveHook;
  manageConnections?: EveHook;
  execute?: EveHook;
  remoteWorkbench?: EveHook;
  remoteBash?: EveHook;
  onAuthLink?: EveAuthLinkHook;
}

export const denyEveToolCall = (reason: string): ToolExecuteResponse => ({
  data: {},
  error: reason,
  successful: false,
});

const HOOK_BY_SLUG = {
  COMPOSIO_SEARCH_TOOLS: 'search',
  COMPOSIO_MANAGE_CONNECTIONS: 'manageConnections',
  COMPOSIO_MULTI_EXECUTE_TOOL: 'execute',
  COMPOSIO_EXECUTE_TOOL: 'execute',
  COMPOSIO_REMOTE_WORKBENCH: 'remoteWorkbench',
  COMPOSIO_REMOTE_BASH_TOOL: 'remoteBash',
} as const;

type MetaSlug = keyof typeof HOOK_BY_SLUG;

const hookForSlug = (hooks: EveProviderHooks, slug: string): EveHook | undefined => {
  const hookName = HOOK_BY_SLUG[slug as MetaSlug];
  if (!hookName) return undefined;
  return hooks[hookName];
};

const extractAuthLinks = (result: ToolExecuteResponse): string[] => {
  const links = new Set(extractComposioConnectLinks(result.data));
  for (const link of extractComposioConnectLinks(result.error)) {
    links.add(link);
  }
  return Array.from(links);
};

const runHook = async <C>(
  hook: ((ctx: C, next: Next) => MaybePromise<ToolExecuteResponse | void>) | undefined,
  ctx: C,
  getDefault: Next
): Promise<ToolExecuteResponse> => {
  if (!hook) return getDefault();

  let pending: Promise<ToolExecuteResponse> | undefined;
  const next: Next = () => {
    if (!pending) pending = getDefault();
    return pending;
  };

  const hookResult = await hook(ctx, next);
  if (hookResult !== undefined && hookResult !== null) return hookResult;
  if (pending) return pending;
  return next();
};

export async function applyHooks(
  hooks: EveProviderHooks,
  slug: string,
  args: Record<string, unknown>,
  executeTool: ExecuteToolFn,
  eveContext: ToolContext
): Promise<ToolExecuteResponse> {
  const context = { slug, eve: eveContext };
  const ctx: EveHookContext = { request: { slug, args }, context, deny: denyEveToolCall };
  const hook = hookForSlug(hooks, slug);
  const result = await runHook(hook, ctx, () => executeTool(ctx.request.slug, ctx.request.args));

  const { onAuthLink } = hooks;
  if (!onAuthLink) return result;

  let current = result;
  for (const url of extractAuthLinks(result)) {
    const previous = current;
    current = await runHook(
      onAuthLink,
      { url, result: previous, context, deny: denyEveToolCall },
      async () => previous
    );
  }
  return current;
}
