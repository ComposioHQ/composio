---
'@composio/core': patch
---

Reuse tool schemas fetched by `tools.get()` when provider-wrapped tools execute, avoiding a redundant schema retrieval request for each agentic tool call.
