---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.19`. The SDK forwards the API client's log lines through a `Console`-shaped object instead of the client's removed `Logger` interface; what is logged, and at which SDK level, is unchanged. With rc.19, the client returned by `getClient()` no longer has `apiKey`, `userApiKey`, `orgApiKey` or `logger`, and its `baseURL`, `maxRetries`, `timeout` and `logLevel` are read-only: read the keys from `getConfig()`, and derive a client with `withOptions()` to change the others.
