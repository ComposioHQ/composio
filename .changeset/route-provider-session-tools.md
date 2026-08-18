---
'@composio/core': minor
'@composio/openai': minor
'@composio/anthropic': minor
---

Allow OpenAI and Anthropic provider tool-call helpers to execute through a supplied Tool Router session. Session meta-tools now retain their session context while provider argument normalization remains intact; existing user-ID calls continue to use direct execution. Anthropic helper failures now preserve their error text in `{ error }` results without changing successful payloads. Custom provider subclasses overriding `executeToolCall` or `handleToolCalls` may require updates because these methods now accept session targets.
