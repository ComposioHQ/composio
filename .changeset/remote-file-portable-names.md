---
'@composio/core': patch
---

`RemoteFile.save()` without a path no longer rejects ordinary file names. Names with characters Windows reserves, such as `report_2026-09-29T10:30:00.csv` or `What is this?.png`, are saved with those characters replaced by `_`. Names longer than 128 bytes are truncated with their extension kept, and reserved device names such as `NUL` get a `_` prefix. Names with a NUL byte or no usable basename are still refused.
