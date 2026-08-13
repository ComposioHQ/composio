---
'@composio/core': patch
---

Bound the best-effort telemetry requests with a timeout so a stalled telemetry endpoint cannot leave an SDK call pending indefinitely.
