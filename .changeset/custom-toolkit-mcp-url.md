---
'@composio/core': minor
'@composio/slim': minor
---

Breaking (experimental API): `composio.experimental.customToolkits.create()` and `upsert()` take the MCP server URL as `mcpUrl` instead of `appUrl`, and send it to the API as `mcp_url`.
