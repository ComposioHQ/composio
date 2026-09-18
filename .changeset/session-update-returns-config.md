---
'@composio/core': minor
---

Expose the server-side session configuration on sessions and return it from `update()`. `session.config` now carries the toolkit/tool allowlists, tags, auth configs, connected accounts, `manage_connections`, preload and sandbox settings the API returned for the session (from `create()`, `use()` and after every `update()`), and `session.update()` resolves to that updated config instead of `void`. Previously the only `config` reachable on a session object at runtime was the SDK's own `ComposioConfig`, and reading the live allowlist after `sessions.use(id)` required dropping to the raw client.
