---
'@composio/core': patch
---

Add a `proxyExecute` session option. `composio.sessions.create(userId, { proxyExecute: true })` exposes the `COMPOSIO_PROXY_EXECUTE` meta tool, which lets the agent call a toolkit's API directly with the user's connected account. A boolean is shorthand for `{ enable: boolean }`. `session.update()` accepts the same option, and `null` removes the stored value. `proxyExecute: false` also turns off the sandbox `proxy_execute()` helper, and the API rejects it at creation together with `sandbox.enableProxyExecution: true`.
