---
'@composio/core': patch
---

Fix: reject automatic file downloads when writing the downloaded file to disk fails instead of returning a successful result with a null file path.
