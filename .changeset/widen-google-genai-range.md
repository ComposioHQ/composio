---
'@composio/google': patch
'@composio/python-sdk': patch
---

Accept `@google/genai` 2.x and 3.x in `@composio/google` and update JSDoc examples to `ai.models.generateContent`. Widen `composio-gemini` to `google-genai>=2.34.0,<4`, preserve tool schema descriptions/enums/bounds and optional parameters in declarations, and deprecate `composio-google`.
