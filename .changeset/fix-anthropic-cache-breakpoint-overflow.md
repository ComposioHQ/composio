---
'@composio/anthropic': patch
---

Fix `cacheTools: true` exceeding Anthropic's 4-breakpoint-per-request limit (shared with the system prompt and messages), which causes the whole request to be rejected. `wrapTools` now places a single breakpoint on the last tool, which caches the entire tool list since a breakpoint covers everything up to and including it, instead of one on every tool. `handleToolCalls` no longer marks `tool_result` blocks, because they accumulate in the message history and would exceed the limit after a few turns.
