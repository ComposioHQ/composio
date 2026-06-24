---
'@composio/core': patch
---

Surface the resolved workbench config on Tool Router sessions and rework the experimental BYO local workbench helper.

- `Session.workbench` is now populated from the API response (on create/retrieve/attach/update). It exposes the resolved workbench config, e.g. `session.workbench?.enable` (defaults to `true` server-side).
- **Breaking (experimental):** `experimental_createLocalWorkbenchSession` now takes a caller-created session — `experimental_createLocalWorkbenchSession(composio, session)` — instead of `(composio, userId, config)`. It throws unless the session was created with `workbench: { enable: false }` (a local sandbox and the remote workbench cannot both run for one session), and returns `{ helperSource, env }` (the `session` is no longer returned, since the caller already owns it). The `LocalWorkbenchConfig` type is removed.

The local workbench still assumes code runs in the developer's sandbox and exposes Apollo-parity Python helpers for `run_composio_tool`, `invoke_llm`, and `web_search`.

> **Security caveat:** the helper authenticates with the developer's full *project* API key, injected into the sandbox env as `COMPOSIO_API_KEY`. Any code or tool output running in the sandbox can read and exfiltrate it — treat the sandbox as your security boundary and rotate the key. A session-scoped `x-session-access-key` (so the long-lived project key never enters the sandbox) is the planned follow-up.
