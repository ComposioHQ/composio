---
'@composio/core': minor
'@composio/slim': minor
---

`composio.experimental.customToolkits.create()` takes the MCP server URL as `mcpUrl`. `appUrl` still works but is deprecated; passing both, or neither, throws `ValidationError`. Python's `experimental.custom_toolkits.create()` takes `mcp_url` the same way and warns when given `app_url`.
