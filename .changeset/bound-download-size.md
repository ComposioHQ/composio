---
'@composio/core': patch
---

Fix: automatic S3 file downloads are now capped at 100 MiB (configurable per call) to prevent memory exhaustion from oversized or streaming responses.
