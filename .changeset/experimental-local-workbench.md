---
'@composio/experimental': minor
---

Add the experimental BYO local workbench helpers on the new `@composio/experimental/workbench` subpath.

These let you run a Composio Tool Router session in a sandbox you own instead of Composio's hosted remote sandbox:

- `experimental_createLocalWorkbenchSession(composio, session)` takes a caller-created session and returns `{ helperSource, env }`. It throws unless the session was created with `workbench: { enable: false }` (a local sandbox and the remote workbench cannot both run for one session).
- `experimental_createWorkbenchEnv(options)` builds the environment variables the in-sandbox helper needs to reach Composio.
- `experimental_createPythonWorkbenchHelperSource(options)` returns the Python helper source.

The local workbench assumes code runs in the developer's sandbox and exposes Apollo-parity Python helpers for `run_composio_tool`, `invoke_llm`, `web_search`, and `proxy_execute`.

> **Security caveat:** the helper authenticates with the developer's full *project* API key, injected into the sandbox env as `COMPOSIO_API_KEY`. Any code or tool output running in the sandbox can read and exfiltrate it — treat the sandbox as your security boundary and rotate the key. A session-scoped `x-session-access-key` (so the long-lived project key never enters the sandbox) is the planned follow-up.
