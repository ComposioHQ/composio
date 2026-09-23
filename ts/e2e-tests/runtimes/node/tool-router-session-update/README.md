# Tool Router Session Update E2E Test

End-to-end regression test for `session.update()` with default options.

## Prerequisites

- Docker (for running tests in containers)
- `COMPOSIO_API_KEY` environment variable (any Composio project works)

## Running

```bash
# From repo root
COMPOSIO_API_KEY=your_key pnpm test:e2e:node --filter=@e2e-tests/node-tool-router-session-update

# Or from this directory
COMPOSIO_API_KEY=your_key bun test e2e.test.ts
```

## What it tests

`@composio/core` 0.20.0 sent `expected_config_version` on every `session.update()` call. The API rejected that field with a 400, so no default update could succeed, and mocked unit tests could not see it.

1. **Create** – Create a session with `toolkits: ['github', 'gmail']`
2. **Update** – Call `session.update({ toolkits: ['github'] })` with default options and assert the returned toolkits and a higher `configVersion`
3. **Persisted** – Re-read the session with `sessions.use()` and assert the server kept the change
4. **Cleanup** – Delete the session
