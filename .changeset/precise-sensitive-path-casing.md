---
'@composio/core': patch
---

Match sensitive upload path segments using the target filesystem's actual case sensitivity so case-insensitive mounts cannot bypass the denylist without over-blocking distinct paths on case-sensitive mounts.
