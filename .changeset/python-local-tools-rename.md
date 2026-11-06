---
'@composio/python-sdk': minor
---

Renames in-process custom tools to local tools, so they are no longer confused with the server-side custom toolkits on `composio.experimental.custom_toolkits`. Pass `experimental={"local_tools": ..., "local_toolkits": ...}` to `composio.create()`, and `local_tools=` and `local_toolkits=` to `composio.use()`. List them with `session.local_tools()` and `session.local_toolkits()`. The types are now `LocalTool`, `LocalToolkit`, `RegisteredLocalTool` and `RegisteredLocalToolkit`. The `custom_tools` and `custom_toolkits` options and session methods still work but emit `ComposioDeprecationWarning`, and the `Custom*` type names remain as aliases. Passing both a new option and its deprecated alias raises `InvalidParams`. The request sent to the API is unchanged.
