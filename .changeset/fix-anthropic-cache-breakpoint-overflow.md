---
'@composio/anthropic': patch
---

Fix `cacheTools: true` placing a cache_control breakpoint on every wrapped tool, which exceeds Anthropic's 4-breakpoint-per-request limit (shared with the system prompt and messages) once 5 or more tools are wrapped, causing the whole request to be rejected. `wrapTools` now places a single breakpoint on the last tool, which caches the entire tool list since a breakpoint covers everything up to and including it.
