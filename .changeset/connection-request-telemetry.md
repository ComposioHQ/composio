---
'@composio/core': patch
---

Restore telemetry for `ConnectionRequest.waitForConnection()`. `telemetry.instrument()` now also instruments async methods defined directly on plain objects, such as the ones returned by `createConnectionRequest()`.
