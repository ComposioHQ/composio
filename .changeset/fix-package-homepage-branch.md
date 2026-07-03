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
'@composio/openai': patch
'@composio/openai-agents': patch
'@composio/vercel': patch
---

Fix the `homepage` links in these packages' `package.json`. They pointed at `github.com/ComposioHQ/composio/tree/main/...`, but the default branch is `next` and no `main` branch exists, so every link 404'd on npm and in editor tooltips. They now point at `tree/next/...`.
