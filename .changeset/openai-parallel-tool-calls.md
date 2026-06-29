---
'@composio/core': patch
---

Execute every parallel tool call in `OpenAIProvider.handleToolCalls`. It previously only ran the first tool call in each assistant message, so parallel tool calls (on by default) dropped the rest and left their `tool_call_id`s unanswered, failing the next request.
