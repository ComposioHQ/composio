---
'@composio/core': patch
---

Export `readResponseBodyWithLimit` and `MAX_URL_UPLOAD_SIZE_BYTES` so downstream packages can apply the SDK's 100 MiB cap when they download a file from a user-supplied URL. The CLI's tool-input file uploads now use it instead of buffering the whole response.
