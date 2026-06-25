---
'@composio/core': patch
---

Retry presigned file uploads without the `Content-Type` header when storage rejects the initial PUT as unauthorized.
