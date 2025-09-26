---
'@composio/core': patch
'@composio/anthropic': patch
'@composio/cloudflare': patch
'@composio/google': patch
'@composio/langchain': patch
'@composio/mastra': patch
'@composio/openai': patch
'@composio/openai-agents': patch
'@composio/vercel': patch
---

- Adds the new experiemntal ToolRouter, Deprecates the existing MCP experience and adds the new MCP components. 
- The old MCP components can be accessed via `deprecated.mcp` until the next release, where it will get removed. 
- Fixes `toolkits.list` and `toolkits.get` methods to add `description` to connection fields
