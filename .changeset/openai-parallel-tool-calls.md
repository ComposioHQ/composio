---
'@composio/core': patch
---

Execute every parallel tool call in `OpenAIProvider.handleToolCalls`. It previously only ran the first tool call in each assistant message, so parallel tool calls (on by default) dropped the rest and left their `tool_call_id`s unanswered, failing the next request.

The calls are run sequentially, in the order the model returned them — here "parallel" means the model issued several calls in one turn, not that they execute concurrently — so each `tool_call_id` is answered exactly once and the tool messages come back in a deterministic order.

Only the first choice is handled. Tool results are fed back into a single assistant turn, so with `n > 1` iterating over every choice would run each tool call once per choice and orphan the `tool_call_id`s from the alternative completions.
