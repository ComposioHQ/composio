---
'@composio/core': patch
---

Fix file downloads reporting success when the downloaded bytes cannot be saved. Direct calls to `composio.files.download()` now reject with `ComposioFileDownloadError` (code `TS-SDK::FILE_DOWNLOAD_FAILED`) for unsuccessful HTTP responses or persistence failures. Directory-creation and write errors are preserved in `cause`, and HTTP status and download metadata are available to TypeScript callers.

Automatic downloads during tool execution keep their existing graceful-failure behavior: unsuccessful downloads produce `uri: ''` and `file_downloaded: false` instead of a null file path. Tool execution does not reject solely because the file download failed.

`saveFile()` keeps its nullable contract. Transport, response-body/size-limit, abort, and SSRF errors retain their existing types.
