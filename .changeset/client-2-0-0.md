---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0`. POST and PATCH requests, including tool execution and trigger creation, are now sent once instead of being retried on a lost response or a retryable status, because a write can complete on the server after its response is lost. Other requests keep their retries. On the client returned by `getClient()`, a write retries only when that call sets `maxRetries`.
