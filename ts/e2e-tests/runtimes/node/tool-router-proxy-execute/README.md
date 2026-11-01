# Tool Router Proxy Execute Option E2E Test

End-to-end test for the `proxyExecute` session option on `sessions.create()` and `session.update()`.

## Prerequisites

- Docker (for running tests in containers)
- `COMPOSIO_API_KEY` environment variable (any Composio project works)
- `COMPOSIO_BASE_URL` (optional) to target a non-production backend

## Running

```bash
# From repo root
COMPOSIO_API_KEY=your_key pnpm test:e2e:node --filter=@e2e-tests/node-tool-router-proxy-execute

# Or from this directory
COMPOSIO_API_KEY=your_key bun test e2e.test.ts
```

## What it tests

Unit tests mock the transport, so they cannot tell whether the API accepts the `proxy_execute` block, stores it, or lists the `COMPOSIO_PROXY_EXECUTE` meta tool. This suite sends the real requests.

1. **Create on** – `sessions.create(userId, { proxyExecute: true })` stores `{ enable: true }` and `session.tools()` lists `COMPOSIO_PROXY_EXECUTE`
2. **Update off** – `session.update({ proxyExecute: false })` stores `{ enable: false }` and the tool is no longer listed
3. **Update block, then remove** – `session.update({ proxyExecute: { enable: true } })` stores the block; `session.update({ proxyExecute: null })` removes it
4. **Default** – `sessions.create(userId)` leaves `proxy_execute` unset and does not list the tool
5. **Conflict** – `proxyExecute: false` with `sandbox: { enableProxyExecution: true }` is rejected at creation
6. **Cleanup** – Delete the sessions
