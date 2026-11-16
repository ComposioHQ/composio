---
'@composio/core': patch
'@composio/python-sdk': patch
---

Stop connection polling at the deadline after a rate-limited response. When a `429` with `Retry-After` reaches the timeout, `waitForConnection()` and `wait_for_connection()` now time out instead of sending another status request with a fresh client retry cycle.
