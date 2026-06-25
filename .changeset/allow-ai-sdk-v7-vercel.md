---
'@composio/vercel': patch
---

Allow `ai@7` (AI SDK v7) as a peer dependency.

The Vercel provider only imports `tool` and the `Tool` / `ToolSet` types from `ai`, all of which are unchanged in AI SDK v7 — `tool()` still accepts `inputSchema`, and the v7 tool-related breaking changes (`needsApproval` relocation, `ToolCallOptions` → `ToolExecutionOptions`, and removal of tool-result `media` parts) are not used by this adapter. No source changes are required; the peer-dependency range is simply widened to `^5.0.0 || ^6.0.0 || ^7.0.0`.
