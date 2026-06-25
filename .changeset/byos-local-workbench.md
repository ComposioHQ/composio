---
'@composio/core': minor
---

Surface the resolved workbench config on Tool Router sessions.

- `Session.workbench` is now populated from the API response (on create/retrieve/attach/update). It exposes the resolved workbench config, e.g. `session.workbench?.enable` (defaults to `true` server-side).

This lets callers create a session with the remote workbench disabled (`workbench: { enable: false }`) and detect that state — the foundation for running code in a sandbox you own via the experimental `@composio/experimental/workbench` helpers.
