---
'@composio/cli': patch
---

Fix `always_allow`/`always_deny` tool-permission overrides not being honored for a handful of tools (Outlook message tools among them) whose current slug no longer matches the slug the server's `/consumer/permissions/resolve` response still files the override under (a stale doubled-prefix form, e.g. `OUTLOOK_OUTLOOK_SEARCH_MESSAGES` instead of `OUTLOOK_SEARCH_MESSAGES`). The CLI now normalizes any doubled-leading-word override key to its bare slug before evaluating permissions, so an existing policy is honored under the tool's current slug instead of silently falling back to `ask_every_call`. This is a client-side normalization of a stale server-returned key, not a change to the underlying permission data — the server-side `/consumer/permissions/resolve` response itself still returns the legacy key.
