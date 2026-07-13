---
'@composio/core': patch
---

Fix realtime trigger chunk reassembly so incomplete, malformed, conflicting, and stale payloads cannot dispatch corrupted events or retain unbounded state.
