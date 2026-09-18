---
'@composio/core': minor
---

Add `session.ensureConnected(toolkit, options?)`: it returns immediately when the session already resolves an active connection (or the toolkit is no-auth), and only when needed starts the authorization flow via `session.authorize()` and waits for the new connection to become active. This prevents `authorize()` from spawning duplicate pending connections for toolkits that are already connected. The `session.execute()` `account` option is now documented as accepted on every project — on single-account projects the identifier must match one of the session's active connections for the toolkit (matching the API behavior).
