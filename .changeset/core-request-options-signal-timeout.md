---
"@composio/core": minor
---

Add per-request cancellation to public SDK methods via a new `ComposioRequestOptions` (`{ signal?: AbortSignal }`) trailing argument, plus a typed `ComposioRequestCancelledError` for detecting caller-initiated aborts.

Without this, a slow `tools.get` or `tools.execute` had no way to be cancelled — a 100s search would block the calling agent indefinitely. The new shape:

```typescript
try {
  const tools = await composio.tools.get(
    'user_1',
    { search: 'send email', limit: 50 },
    { signal: AbortSignal.timeout(5_000) }
  );
} catch (err) {
  if (err instanceof ComposioRequestCancelledError) {
    return;
  }
  throw err;
}
```

The signal is forwarded to the underlying `@composio/client` fetch. Any abort error (`APIUserAbortError`, `AbortError`, or `DOMException(name='AbortError')`) coming back is normalized to `ComposioRequestCancelledError` so callers can `instanceof`-detect cancellation without unwrapping nested causes. Catch-and-wrap paths in `tools.execute` / `tools.getRawComposioToolBySlug` / `toolkits.get` re-throw the cancellation error rather than remapping it to `ComposioToolExecutionError` / `ComposioToolNotFoundError` / `ComposioToolkitFetchError`.

Wired through on:
- **Tools**: `get`, `getRawComposioTools`, `getRawComposioToolBySlug`, `getRawToolRouterSessionTools`, `execute`, `executeSessionTool`, `getToolsEnum`, `getInput`, `proxyExecute`
- **Toolkits**: `get`, `listCategories`
- **AuthConfigs**: `list`, `create`, `get`, `update`, `delete`, `updateStatus`, `enable`, `disable`
- **ConnectedAccounts**: `list`, `get`, `delete`, `refresh`, `updateStatus`, `enable`, `disable`, `update`
- **Triggers**: `listActive`, `create`, `update`, `delete`, `enable`, `disable`, `listTypes`, `getType`, `listEnum`
- **MCP**: `create`, `list`, `get`, `delete`, `update`, `generate`
- **ToolRouter** (`composio.create` / `composio.use`, `composio.toolRouter.create` / `.use`) — long-running session-creation paths
- **ToolRouterSession**: `authorize`, `toolkits`, `search`, `execute`, `proxyExecute`, `update`

### Custom-tool cooperative cancellation

Native tool execution is cancelled by the SDK (the underlying `fetch` is aborted). Custom tools are different — the SDK can't preempt user-supplied JavaScript. Two affordances are added so callers get sensible behavior anyway:

1. **Pre-execute signal check**: if `signal.aborted` is true before the user's `execute` runs, the SDK throws `ComposioRequestCancelledError` and never invokes user code.
2. **Cooperative signal forwarding**: the same `AbortSignal` is exposed via `SessionContext.signal` for Tool Router custom tools. Long-running implementations can wire `ctx.signal` into their own `fetch` (or any abortable IO) to abort mid-execution; the resulting `AbortError` is normalized to `ComposioRequestCancelledError` by the SDK.

```typescript
import { experimental_createTool } from '@composio/core';

const longRunningFetch = experimental_createTool('LONG_RUNNING_FETCH', {
  name: 'Long-running fetch',
  description: 'Fetches a URL with cooperative cancellation',
  inputParams: z.object({ url: z.string() }),
  execute: async (input, ctx) => {
    // Pass ctx.signal into fetch so a session.execute(...) abort cancels
    // the in-flight HTTP request mid-flight.
    const resp = await fetch(input.url, { signal: ctx.signal });
    return { result: await resp.json() };
  },
});
```
