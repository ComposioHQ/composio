---
'@composio/core': patch
---

Fix the name of auto-uploaded local files: the extension now comes from the file name, so a dotted directory or an extensionless file no longer puts parts of the local path into the uploaded file's name.
