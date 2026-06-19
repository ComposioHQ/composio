---
'@composio/core': minor
'@composio/json-schema-to-zod': minor
'@composio/ts-builders': minor
'@composio/cli': minor
'@composio/cli-keyring': minor
'@composio/cli-local-tools': minor
'@composio/anthropic': minor
'@composio/claude-agent-sdk': minor
'@composio/cloudflare': minor
'@composio/google': minor
'@composio/langchain': minor
'@composio/llamaindex': minor
'@composio/mastra': minor
'@composio/openai': minor
'@composio/openai-agents': minor
'@composio/vercel': minor
---

Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.
