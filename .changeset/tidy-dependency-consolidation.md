---
'@composio/core': patch
'@composio/slim': patch
'@composio/experimental': patch
'@composio/json-schema-to-effect-schema': patch
'@composio/json-schema-to-zod': patch
'@composio/anthropic': patch
'@composio/claude-agent-sdk': patch
'@composio/mastra': patch
'@composio/langchain': patch
'@composio/typesafe': patch
'@composio/python-sdk': patch
---

Update runtime dependencies, require patched Zod 4 releases where used directly, support Anthropic SDK 1.6, and update the AutoGen provider's FLAML dependency. Preserve Zod 3 compatibility fixtures and existing framework version boundaries.
