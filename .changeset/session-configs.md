---
'@composio/core': minor
---

Add experimental support for saved Session configs. `composio.sessionConfigs.list()` and `composio.sessionConfigs.get()` read the project's saved `sc_…` configs, and `experimental.sessionConfigId` on `composio.sessions.create()` starts a session from one. Combining `sessionConfigId` with inline access fields now fails before any request: on create with `toolkits`, `tools`, `tags`, `experimental.customTools` or `experimental.customToolkits`, and on `session.update()` with `toolkits`, `tools` or `tags` (including `null`). TypeScript reports the mix at compile time and the SDK throws `ValidationError` at runtime; other invalid inputs keep throwing `ZodError`. `session.experimental.sourceSessionConfig` exposes the last config applied to the session after `create()`, `sessions.use()` and `update()`. A 409 while `update()` applies a config now says that the session or the config changed and to re-fetch and retry, instead of reporting a stale version.
