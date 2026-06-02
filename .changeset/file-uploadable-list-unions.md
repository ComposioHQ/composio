---
'@composio/core': patch
---

Fix automatic file upload/download substitution for file schemas that accept either a single file or a list of files.

The file modifier now selects composed-schema branches by runtime value shape, so `anyOf(file, array<file>)` uploads or downloads each file when the tool receives a list while preserving existing single-file behavior.
