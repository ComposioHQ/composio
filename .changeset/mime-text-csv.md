---
'@composio/core': patch
'@composio/slim': patch
---

`getExtensionFromMimeType` now maps `text/csv` to `csv` from its table, matching the Python SDK. The returned extension is unchanged.
