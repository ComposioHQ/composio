---
'@composio/openai': patch
---

Fix: stop printing MCP server URLs (credential-bearing) to stdout via console.log in the OpenAI Responses provider; log server names via logger.debug instead.
