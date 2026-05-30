---
"@composio/llamaindex": patch
"@composio/claude-agent-sdk": patch
---

fix(providers): normalize string tool input in LlamaIndex and Claude Agent SDK providers

Models occasionally emit tool-call input as a JSON string rather than an object (issue #2406).
`ExecuteToolFn` is typed to receive a `Record<string, unknown>`, but the LlamaIndex and Claude
Agent SDK providers forwarded the model input unchecked, so a stringified payload reached
execution as a raw string (`Input should be a valid dictionary`). Both now parse a string input
to an object before forwarding — matching the guard already shipped in the vercel, cloudflare and
openai-agents providers. Also backfills regression tests for the string path in all three
providers (the openai-agents guard previously had no test).
