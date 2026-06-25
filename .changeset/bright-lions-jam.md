---
'@composio/core': minor
---

Add the first-class `composio.sessions.create()` API while keeping `composio.create()` as an alias, expose the experimental shared-connection ACL patch helper as `connectedAccounts.updateAcl()` while keeping `experimental.updateAcl()` as an alias, and include SDK docs/source in the published package.

**MCP is now opt-in.** Sessions return native tools by default; the hosted MCP endpoint is only surfaced on the type when you create the session with `{ mcp: true }`. The default `create()` / `use()` now return `SessionWithoutMcp` (the runtime object is unchanged — `session.mcp` still exists at runtime — but it is no longer in the type).

Migration: read `session.mcp` only after creating with `{ mcp: true }`.
