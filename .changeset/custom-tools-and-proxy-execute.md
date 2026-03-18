---
"@composio/core": minor
---

Add custom tools, custom toolkits, and proxy execute for tool router sessions

- `experimental_createTool()` and `experimental_createToolkit()` for defining local tools that execute in-process
- Three tool types: standalone (no auth), extension (inherits toolkit auth), and toolkit-grouped
- `session.proxyExecute()` for raw HTTP API calls through Composio's auth layer
- `ctx.proxyExecute()` available inside custom tool execute functions for calling external APIs
- Custom tool slug mapping uses backend response (`slug`/`original_slug`) instead of client-side prefix computation
- Uses official `@composio/client@0.1.0-alpha.62` types for `SessionCreateParams.Experimental.CustomTool`, `SessionProxyExecuteParams`, and `SessionProxyExecuteResponse`
