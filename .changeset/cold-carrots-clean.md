---
'@composio/core': patch
'@composio/json-schema-to-zod': patch
'@composio/anthropic': patch
'@composio/cloudflare': patch
'@composio/google': patch
'@composio/langchain': patch
'@composio/llamaindex': patch
'@composio/mastra': patch
'@composio/openai': patch
'@composio/openai-agents': patch
'@composio/vercel': patch
---

- Fix dangerously skip version check in non agentic providers
- Throw error instead of process.exit when api key doesn't exist
- bump zod-to-json-schema to 3.25.0, which supports "zod/3" 

