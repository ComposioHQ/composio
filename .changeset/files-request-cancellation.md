---
'@composio/core': patch
---

Let `composio.files.upload()` and `composio.files.download()` be cancelled. Both now accept trailing request options (`{ signal }`), like the other SDK methods that do HTTP I/O. The signal reaches the presigned-URL request and the S3 transfer, and an aborted call rejects with `ComposioRequestCancelledError` instead of running to completion. Calls cancelled by `AbortSignal.timeout()` or by `abort(reason)` during a direct S3 transfer now also reject with `ComposioRequestCancelledError` rather than the signal's raw reason.
