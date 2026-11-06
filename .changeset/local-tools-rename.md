---
'@composio/core': minor
'@composio/slim': minor
---

Renames in-process custom tools to local tools, so they are no longer confused with the server-side custom toolkits on `composio.experimental.customToolkits`. Pass `experimental.localTools` and `experimental.localToolkits` to `composio.create()`, and `localTools` and `localToolkits` to `composio.use()`. List them with `session.localTools()` and `session.localToolkits()`. The types are now `LocalTool`, `LocalToolkit`, `RegisteredLocalTool`, `RegisteredLocalToolkit`, `CreateLocalToolParams`, `CreateLocalToolkitParams` and `LocalToolExecuteFn`. The `customTools` and `customToolkits` options, the `session.customTools()` and `session.customToolkits()` methods, and the `Custom*` type names are deprecated and keep working. Passing both a new option and its deprecated alias throws `ValidationError`. The request sent to the API is unchanged.
