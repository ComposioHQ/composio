---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.21`. The SDK's behaviour is unchanged. With rc.21, the client returned by `getClient()` no longer has `request()`, `Composio.Composio` or `Composio.DEFAULT_TIMEOUT`: call the raw verb for the method (`get`, `post`, `patch`, `put`, `delete`), which takes the same `query`, `body` and request options.
