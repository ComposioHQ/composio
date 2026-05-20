---
"@composio/core": minor
---

Add per-request `ComposioRequestOptions` (signal/timeout) to public SDK methods so callers can cancel in-flight requests or impose a per-call timeout. Without this, a slow search or tool execution had no way to be aborted — a 100s `tools.list` would block the calling agent indefinitely. The trailing argument is optional and forwarded to the underlying `@composio/client` fetch.

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

// Cancellable search
const tools = await composio.tools.get('user_1', { search: 'send email' }, undefined, {
  signal: controller.signal,
});

// Per-call timeout override
const result = await composio.tools.execute(
  'GITHUB_GET_REPOS',
  { userId: 'user_1', arguments: { owner: 'composio' } },
  undefined,
  { timeout: 10_000 }
);
```

Wired through on: `tools.{get,getRawComposioTools,getRawComposioToolBySlug,getRawToolRouterSessionTools,execute,executeSessionTool,getToolsEnum,getInput,proxyExecute}`, `toolkits.{get,listCategories}`, `authConfigs.{list,create,get,update,delete,updateStatus,enable,disable}`, `connectedAccounts.{list,get,delete,refresh,updateStatus,enable,disable,update}`, `triggers.{listActive,create,update,delete,enable,disable,listTypes,getType,listEnum}`, `mcp.{create,list,get,delete,update,generate}`.
