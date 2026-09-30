---
'@composio/core': patch
---

`RemoteFile.save()` without a path no longer rejects ordinary file names. Names with characters Windows reserves, such as `report_2026-09-29T10:30:00.csv` or `What is this?.png`, are saved with those characters replaced by `_`. Names longer than 128 bytes are truncated with their extension kept, and reserved device names such as `NUL` get a `_` prefix. A name changed this way also gets a short digest of the original before its extension (`What is this_-9c68adf2da8b6e8d.png`). Default saves create a new file exclusively; if the destination exists, a copy number is added before its extension. Repeated default saves therefore return distinct paths and preserve earlier downloads. Names with a NUL byte or no usable basename are still refused.
