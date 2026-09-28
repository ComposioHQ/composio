---
'@composio/core': minor
---

Remove the deprecated OpenAI Assistants API helpers from `OpenAIProvider`: `handleAssistantMessage`, `waitAndHandleAssistantToolCalls`, and `waitAndHandleAssistantStreamToolCalls`. OpenAI shut down the Assistants API on August 26, 2026, so these helpers could no longer complete a run. Use `OpenAIResponsesProvider` from `@composio/openai` with the Responses API instead.
