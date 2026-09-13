---
'@composio/core': patch
---

Accept `createHint` and `updateHint` in session `tags` filters, alongside the existing `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Every Composio tool carries at least one of `readOnlyHint`, `destructiveHint`, `createHint` or `updateHint`, so those four are the reliable set to filter on.
