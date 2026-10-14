---
'@composio/core': patch
'@composio/slim': patch
---

Update the owned API client to `@composio/client@2.0.0-rc.14`. OAuth connection data types now accept a `null` `id_token`. Session tag filters accept the `createHint` and `updateHint` tags. The experimental `instant.returnPricesInSearch` Session option returns each Instant tool's price in Session search results, under `toolkitConnectionStatuses[].instantAccount.prices`. `composio.mcp.generate()` now warns once that its URLs rely on the deprecated `include_composio_helper_actions` query parameter; switch to a Session's MCP endpoint.
