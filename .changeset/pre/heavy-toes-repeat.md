---
'@composio/core': patch
'@composio/experimental': patch
'@composio/slim': patch
---

Move published dependency ranges to their current upstream releases: zod 4.5, openai 7.10, typebox 1.3.27, @mastra/schema-compat 1.3.8, and @cloudflare/workers-types 5.20260905. `@composio/anthropic` also accepts `@anthropic-ai/sdk` 0.124 as a peer, the line it is now tested against.
