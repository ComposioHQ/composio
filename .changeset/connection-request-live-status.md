---
'@composio/core': patch
---

Keep `ConnectionRequest.status` in sync with `waitForConnection()`. The request now reports `ACTIVE` once the connection completes, or the terminal status (`FAILED`, `EXPIRED`, `REVOKED`) when it fails, matching `toJSON()` and the Python SDK.
