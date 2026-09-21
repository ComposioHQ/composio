---
'@composio/core': patch
---

Fix `composio.mcp.update()` silently dropping parts of the requested configuration. Tool-only updates (`allowedTools` without `toolkits`) sent no tools field at all, updates with toolkits sent the deprecated create-time `custom_tools` alias that the update endpoint ignores instead of `allowed_tools`, and `manuallyManageConnections` was forwarded as-is instead of being inverted into `managed_auth_via_composio` (so `manuallyManageConnections: true` stored the opposite configuration). `create()` and `update()` now also keep the auth config of a `{ toolkit, authConfigId }` toolkit entry instead of discarding it, and `create()` sends `allowed_tools` rather than the deprecated `custom_tools` alias, matching the Python SDK.
