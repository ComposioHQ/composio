---
'@composio/langchain': minor
'@composio/llamaindex': minor
'@composio/claude-agent-sdk': minor
'@composio/vercel': minor
'@composio/google': minor
'@composio/openai-agents': minor
---

Dereference internal $ref/$defs in tool input schemas before provider translation, so properties reachable only through a reference keep their types and validation instead of degrading to untyped (z.any) or being emitted as a dangling reference.

This changes the JSON Schema these providers emit for $ref-using tools. Downstream snapshot tests on tool definitions will see diffs. Schemas the Composio API ships with a $ref but no $defs block (e.g. GMAIL_FETCH_EMAILS) degrade to a permissive object schema rather than throwing. The strict-structured-outputs path of @composio/openai-agents is unchanged — OpenAI supports $defs/$ref natively, including recursion.
