---
"@composio/core": minor
---

Add per-request cancellation to public SDK methods via a new `ComposioRequestOptions` (`{ signal?: AbortSignal | null }`) trailing argument, plus a typed `ComposioRequestCancelledError` for detecting caller-initiated aborts.

Without this, a slow `tools.list` or `tools.execute` had no way to be cancelled — a 100s search would block the calling agent indefinitely. The new shape:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

try {
  const tools = await composio.tools.get(
    'user_1',
    { search: 'send email', limit: 50 },
    undefined,                 // provider options
    { signal: controller.signal }
  );
} catch (err) {
  if (err instanceof ComposioRequestCancelledError) {
    // caller-initiated cancellation — clean up and exit
    return;
  }
  throw err;
}
```

The signal is forwarded to the underlying `@composio/client` fetch. Any abort error (`APIUserAbortError`, `AbortError`, or `DOMException(name='AbortError')`) coming back is normalized to `ComposioRequestCancelledError` so callers can `instanceof`-detect cancellation without unwrapping nested causes. Catch-and-wrap paths in `tools.execute` / `tools.getRawComposioToolBySlug` / `toolkits.get` re-throw the cancellation error rather than remapping it to `ComposioToolExecutionError` / `ComposioToolNotFoundError` / `ComposioToolkitFetchError`.

Wired through on: `tools.{get,getRawComposioTools,getRawComposioToolBySlug,getRawToolRouterSessionTools,execute,executeSessionTool,getToolsEnum,getInput,proxyExecute}`, `toolkits.{get,listCategories}`, `authConfigs.{list,create,get,update,delete,updateStatus,enable,disable}`, `connectedAccounts.{list,get,delete,refresh,updateStatus,enable,disable,update}`, `triggers.{listActive,create,update,delete,enable,disable,listTypes,getType,listEnum}`, `mcp.{create,list,get,delete,update,generate}`.
