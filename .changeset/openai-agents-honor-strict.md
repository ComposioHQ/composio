---
'@composio/openai-agents': patch
---

`OpenAIAgentsProvider({ strict: true })` now takes effect: tools are registered with `strict: true` and a schema normalized for OpenAI structured outputs (every property required, optional ones accept `null`), a `null` argument the tool's own schema does not accept is dropped before execution, and tools whose schema strict mode cannot express are registered without strict mode with a warning. The option was previously ignored.
