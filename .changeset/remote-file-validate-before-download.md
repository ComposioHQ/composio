---
'@composio/core': patch
---

Validate the default destination in `RemoteFile.save()` before downloading content. Invalid mount paths now raise `ValidationError` without a network request, even when the download would fail.
