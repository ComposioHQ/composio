---
'@composio/core': minor
'@composio/anthropic': minor
'@composio/cloudflare': minor
'@composio/google': minor
'@composio/langchain': minor
'@composio/mastra': minor
'@composio/openai': minor
'@composio/openai-agents': minor
'@composio/vercel': minor
---

- Adds the new experiemntal ToolRouter, Deprecates the existing MCP experience and adds the new MCP components. 
- The old MCP components can be accessed via `deprecated.mcp` until the next release, where it will get removed. 
- Fixes `toolkits.list` and `toolkits.get` methods to add `description` to connection fields
