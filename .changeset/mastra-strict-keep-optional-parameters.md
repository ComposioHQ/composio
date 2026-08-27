---
'@composio/mastra': patch
---

`MastraProvider({ strict: true })` now keeps optional parameters instead of dropping them: every property becomes required and optional ones accept `null`, matching the OpenAI providers, and a `null` argument the tool's own schema does not accept is dropped before execution. Tools whose schema strict mode cannot express keep their original schema with a warning.
