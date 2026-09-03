---
'@composio/core': patch
---

Fix custom toolkit child slug mapping: reject response tools that have local handles but no exact toolkit match instead of silently dropping them or binding another toolkit's handler, derive bare-slug ambiguity from local definitions, and only reuse a same-toolkit bare alias in customToolkits().
