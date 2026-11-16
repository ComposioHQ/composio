# @composio/python-sdk

## 0.32.0

### Minor Changes

- f22ab26: Update `composio-client` to 2.1.0. Breaking (experimental API): `composio.experimental.custom_toolkits.create()` and `upsert()` take the MCP server URL as `mcp_url` instead of `app_url`.
- f22ab26: Renames in-process custom tools to local tools, so they are no longer confused with the server-side custom toolkits on `composio.experimental.custom_toolkits`. Pass `experimental={"local_tools": ..., "local_toolkits": ...}` to `composio.create()`, and `local_tools=` and `local_toolkits=` to `composio.use()`. List them with `session.local_tools()` and `session.local_toolkits()`. The types are now `LocalTool`, `LocalToolkit`, `RegisteredLocalTool` and `RegisteredLocalToolkit`. The `custom_tools` and `custom_toolkits` options and session methods still work but emit `ComposioDeprecationWarning`, and the `Custom*` type names remain as aliases. Passing both a new option and its deprecated alias raises `InvalidParams`. The request sent to the API is unchanged.
- f22ab26: `wait_for_connection()` handles rate limits: the delay between polls grows from 1 to 5 seconds, and a poll rejected with a 429 waits as long as its `Retry-After` header asks (up to the timeout) and polls again instead of failing the wait. A NaN timeout now times out instead of polling forever.

### Patch Changes

- f22ab26: The error for a missing API key now explains how to set `COMPOSIO_API_KEY` or pass `api_key=`, and links to where to get a project API key, instead of suggesting `composio login`, which the Python package doesn't install.
