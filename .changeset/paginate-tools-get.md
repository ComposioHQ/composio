---
'@composio/core': patch
---

Fix `tools.get()` silently dropping tools past the first page. When no explicit `limit` is set it now pages through every result via `getAllPages` instead of relying on an implicit `limit = 9999` that the API clamped to 100.
