---
'@composio/core': patch
'@composio/cli': patch
'@composio/cli-keyring': patch
'@composio/slim': patch
'@composio/experimental': patch
'@composio/openai': patch
'@composio/openai-agents': patch
'@composio/anthropic': patch
'@composio/claude-agent-sdk': patch
'@composio/langchain': patch
'@composio/llamaindex': patch
'@composio/google': patch
'@composio/vercel': patch
'@composio/cloudflare': patch
'@composio/mastra': patch
'@composio/typesafe': patch
---

Declare composio's own TypeScript packages as MIT to match the repository LICENSE. These packages carried the `npm init` default of ISC, which does not match the MIT license at the repo root. Genuine forks keep their upstream license: `@composio/ts-builders` stays Apache-2.0 (a fork of `@prisma/ts-builders`), and `@composio/json-schema-to-zod` / `@composio/json-schema-to-effect-schema` keep ISC.
