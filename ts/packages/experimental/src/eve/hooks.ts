import type { ExecuteToolFn, ToolExecuteResponse } from '@composio/core';
import type { ToolContext } from 'eve/tools';

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

const CONNECT_LINK = /https:\/\/connect\.composio\.dev\/[^\s<>)"']+/gi;
const GENERIC_LINK = /https:\/\/[^\s<>)"']*composio[^\s<>)"']*\/link\/[^\s<>)"']+/gi;

const safeStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === 'bigint') return item.toString();
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
        }
        return item;
      }) ?? ''
    );
  } catch {
    return typeof value === 'string' ? value : '';
  }
};

const extractAuthLinks = (result: ToolExecuteResponse): string[] => {
  const text = [safeStringify(result.data), safeStringify(result.error)].join(' ');
  const links = [...(text.match(CONNECT_LINK) ?? []), ...(text.match(GENERIC_LINK) ?? [])];
  return [...new Set(links.map(url => url.replace(/[.,;:!?]+$/g, '')))];
};

const runHook = async <C>(
  hook: ((ctx: C, next: Next) => MaybePromise<ToolExecuteResponse | void>) | undefined,
  ctx: C,
  getDefault: Next
): Promise<ToolExecuteResponse> => {
  if (!hook) return getDefault();
  let pending: Promise<ToolExecuteResponse> | undefined;
  const next: Next = () => (pending ??= getDefault());
  return (await hook(ctx, next)) ?? pending ?? next();
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
  const name = HOOK_BY_SLUG[slug as MetaSlug] as (typeof HOOK_BY_SLUG)[MetaSlug] | undefined;
  const result = await runHook(name ? hooks[name] : undefined, ctx, () =>
    executeTool(ctx.request.slug, ctx.request.args)
  );

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
