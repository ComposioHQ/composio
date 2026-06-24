---
'@composio/core': patch
---

Preserve root `$defs` / `definitions` blocks on tool parameter schemas and dereference them in the Node file modifier, so auto file upload/download detection works when `file_uploadable` or `file_downloadable` is hidden behind an internal `$ref`.
