/**
 * Type-level tests for the MCP opt-in on sessions.
 *
 * `session.mcp` exists at runtime on every session, but is only surfaced in the
 * type when `{ mcp: true }` is passed to `create()` / `use()`. These tests fail
 * the build (tsconfig.type-tests.json) if that gating regresses.
 *
 * See: docs/content/docs/sessions-via-mcp.mdx
 */
import { Composio } from '../src';

declare const composio: Composio;

async function createGating(): Promise<void> {
  // Default: no `{ mcp: true }` → `session.mcp` is NOT in the type.
  const session = await composio.sessions.create('user_123');
  // @ts-expect-error mcp is hidden from the type unless `{ mcp: true }` is passed
  void session.mcp;

  // Native tools are always available.
  await session.tools();

  // Opt-in: `{ mcp: true }` → `session.mcp` is surfaced.
  const mcpSession = await composio.sessions.create('user_123', { mcp: true });
  const _url: string = mcpSession.mcp.url;
  void _url;
}

async function useGating(): Promise<void> {
  const session = await composio.sessions.use('session_123');
  // @ts-expect-error mcp is hidden from the type unless `{ mcp: true }` is passed
  void session.mcp;

  const mcpSession = await composio.sessions.use('session_123', { mcp: true });
  const _url: string = mcpSession.mcp.url;
  void _url;
}

// Regression guard: `create()` / `use()` must keep accepting a trailing
// `requestOptions` (AbortSignal/cancellation) arg — with and without `{ mcp: true }`.
// The `{ mcp: true }` overload refactor previously dropped this from `create()`.
async function requestOptionsArg(): Promise<void> {
  const ctrl = new AbortController();
  await composio.sessions.create('user_123', { toolkits: ['gmail'] }, { signal: ctrl.signal });
  await composio.sessions.create('user_123', { mcp: true }, { signal: ctrl.signal });
  await composio.sessions.create('user_123', undefined, { signal: ctrl.signal });
  await composio.sessions.use('session_123', { customTools: [] }, { signal: ctrl.signal });
  await composio.sessions.use('session_123', { mcp: true }, { signal: ctrl.signal });
}

function bareSessionAliasesAreRemoved(): void {
  // @ts-expect-error Session APIs are only available under `composio.sessions`.
  void composio.create;
  // @ts-expect-error Session APIs are only available under `composio.sessions`.
  void composio.use;
}

void createGating;
void useGating;
void requestOptionsArg;
void bareSessionAliasesAreRemoved;
