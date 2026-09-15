---
'@composio/core': patch
---

Fix: automatic file downloads now reject with a typed `ComposioFileDownloadError` (code `FILE_DOWNLOAD_FAILED`) when the remote fetch fails or the downloaded bytes cannot be written to disk, instead of returning a successful result with a null file path. The underlying filesystem error is preserved in `cause`.
