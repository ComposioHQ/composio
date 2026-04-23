---
"@composio/core": patch
---

**Security:** Harden automatic file uploads by default-blocking local paths under common credential locations (e.g. `.ssh`, `.aws`) and credential-like filenames (e.g. `.env`, default SSH private key names). URLs and `File` objects are unchanged. Opt out with `sensitiveFileUploadProtection: false` only if needed; extend the denylist with `fileUploadPathDenySegments`.

Adds an optional `beforeFileUpload` hook (e.g. on `composio.tools.get`) to rewrite paths, return `false` to abort, or throw. New errors: `ComposioSensitiveFilePathBlockedError`, `ComposioFileUploadAbortedError`.
