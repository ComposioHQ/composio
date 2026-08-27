# @composio/experimental

## 0.2.2

### Patch Changes

- 4ceaede: Refresh the TypeBox runtime dependency.

## 0.2.1

### Patch Changes

- 503b50a: Refresh runtime dependencies across the TypeScript SDK packages.

## 0.2.0

### Minor Changes

- b07fcad: Add an eve provider: `EveProvider` makes `session.tools()` return eve-native `defineTool`s, `defineComposioTools` is the replay-safe `step.started` resolver, and `(ctx, next)` hooks can rewrite, deny, or transform Tool Router meta-tool calls.

  Preserve successful local-tool results when the remote half of a mixed `COMPOSIO_MULTI_EXECUTE_TOOL` batch fails at the transport layer, so callers can see which side effects already completed before retrying.

### Patch Changes

- 58bc93b: Refresh dependency ranges and lockfiles across the workspace.
- fa933a6: Fix the `homepage` links in these packages' `package.json`. They pointed at `github.com/ComposioHQ/composio/tree/main/...`, but the default branch is `next` and no `main` branch exists, so every link 404'd on npm and in editor tooltips. They now point at `tree/next/...`.

## 0.1.0

### Minor Changes

- d17a268: Add the experimental BYO local workbench helpers on the new `@composio/experimental/workbench` subpath.

  These let you run a Composio Tool Router session in a sandbox you own instead of Composio's hosted remote sandbox:

  - `experimental_createLocalWorkbenchSession(composio, session)` takes a caller-created session and returns `{ helperSource, env }`. It throws unless the session was created with `workbench: { enable: false }` (a local sandbox and the remote workbench cannot both run for one session).
  - `experimental_createWorkbenchEnv(options)` builds the environment variables the in-sandbox helper needs to reach Composio.
  - `experimental_createPythonWorkbenchHelperSource(options)` returns the Python helper source.

  The local workbench assumes code runs in the developer's sandbox and exposes Apollo-parity Python helpers for `run_composio_tool`, `invoke_llm`, `web_search`, and `proxy_execute`.

  > **Security caveat:** the helper authenticates with the developer's full _project_ API key, injected into the sandbox env as `COMPOSIO_API_KEY`. Any code or tool output running in the sandbox can read and exfiltrate it — treat the sandbox as your security boundary and rotate the key. A session-scoped `x-session-access-key` (so the long-lived project key never enters the sandbox) is the planned follow-up.

- d17a268: Add an experimental package with a Pi coding-agent provider, static Composio tool wrapping, and dynamic Tool Router session helpers.

### Patch Changes

- d17a268: Add `proxy_execute` to the experimental local workbench helper. The in-sandbox helper from `experimental_createLocalWorkbenchSession` (`@composio/experimental/workbench`) now exposes `proxy_execute(method, endpoint, toolkit, query_params=None, body=None, headers=None)` alongside `run_composio_tool`, `invoke_llm`, and `web_search`, so a local sandbox can make authenticated direct API calls to a connected toolkit when no pre-built tool exists. It posts to the public `…/session/{id}/proxy_execute` route with the session's project API key, and always returns a `(data, error)` tuple.
