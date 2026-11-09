---
'@composio/core': patch
'@composio/openai-agents': patch
'@composio/python-sdk': patch
---

Ship an offline session API reference with the core package and document public configuration/response type imports and readable distributed entry points. Clarify that the OpenAI Agents provider ships declarations and a README, not `src/index.ts`. Session type inspection needs no credentials; authentication requirements for backend operations are unchanged.

Expose Python `Composio.create` and `Composio.use` signatures on the class and export session classes and configuration/response types for credential-free inspection.
