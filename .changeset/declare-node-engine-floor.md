---
'@composio/core': patch
'@composio/slim': patch
'@composio/experimental': patch
'@composio/json-schema-to-zod': patch
'@composio/anthropic': patch
'@composio/claude-agent-sdk': patch
'@composio/cloudflare': patch
'@composio/google': patch
'@composio/langchain': patch
'@composio/llamaindex': patch
'@composio/mastra': patch
'@composio/openai-agents': patch
'@composio/openai': patch
'@composio/vercel': patch
---

Declare Node.js 22.22.3 as the minimum supported runtime for every published TypeScript package so package managers surface incompatible runtimes before users encounter ESM loading failures.
