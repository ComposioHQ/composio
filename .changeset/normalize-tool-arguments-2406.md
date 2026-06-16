---
'@composio/core': patch
'@composio/vercel': patch
'@composio/openai-agents': patch
'@composio/cloudflare': patch
'@composio/anthropic': patch
'@composio/google': patch
'@composio/langchain': patch
'@composio/llamaindex': patch
'@composio/claude-agent-sdk': patch
'@composio/mastra': patch
'@composio/openai': patch
---

fix(providers): normalize string tool-call arguments across all providers

Models occasionally emit tool-call arguments as a JSON string instead of an
object (most visibly with `COMPOSIO_MULTI_EXECUTE_TOOL` on the Vercel AI SDK),
which broke downstream validation with errors like
`tool_use.input: Input should be a valid dictionary`.

`@composio/core` now exposes a single `normalizeToolArguments` helper, and every
provider routes model-supplied arguments through it. Object payloads pass
through unchanged, JSON strings are parsed, empty/`null` payloads become `{}`,
and anything that cannot resolve to an object throws a typed
`ComposioInvalidToolArgumentsError` instead of a raw `SyntaxError` or a silently
forwarded malformed string. This replaces the inconsistent per-provider guards
that previously existed only in vercel, cloudflare and openai-agents.
