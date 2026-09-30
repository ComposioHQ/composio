---
'@composio/cli': patch
---

Fix `always_allow`/`always_deny` tool-permission overrides not being honored for tools whose stored override key uses a stale doubled-prefix slug (Outlook tools, for example). The server's `/consumer/permissions/resolve` response can still file an override under `OUTLOOK_OUTLOOK_SEARCH_MESSAGES` instead of the tool's current `OUTLOOK_SEARCH_MESSAGES`, so the lookup missed and the CLI silently fell back to `ask_every_call`. The CLI now normalizes any doubled-leading-word override key to its bare slug, both when a fresh permission snapshot is fetched and when a cached snapshot is read, and a canonical key already present is never overwritten. This is a client-side normalization of a stale server-returned key, not a change to the underlying permission data: the server response itself still returns the legacy key.
