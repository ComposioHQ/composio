---
'@composio/anthropic': patch
---

Remove the unused `@mastra/mcp` peer dependency. The provider never imported it, but package managers that install peers automatically pulled in about 234 extra packages.
