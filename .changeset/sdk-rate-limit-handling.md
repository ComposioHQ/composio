---
'@composio/core': minor
---

Handle rate limits better: `tools.execute()` reuses tool schemas instead of fetching one per call, `waitForConnection()` backs off between polls and waits out a 429, and tool fetches and executions rejected with a 429 throw `ComposioToolFetchRateLimitError` or `ComposioToolExecutionRateLimitError` (check with `isComposioRateLimitError`).
