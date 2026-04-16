# Tool Router Pagination E2E Test

End-to-end regression test for `session.toolkits()` cursor pagination.

## Prerequisites

- Docker (for running tests in containers)
- `COMPOSIO_API_KEY` environment variable (any Composio project works)

## Running

```bash
# From repo root
COMPOSIO_API_KEY=your_key pnpm test:e2e:node --filter=@e2e-tests/node-tool-router-pagination

# Or from this directory
COMPOSIO_API_KEY=your_key bun test e2e.test.ts
```

## What it tests

Regression coverage for [PLEN-1886](https://linear.app/composio/issue/PLEN-1886): `session.toolkits()` was silently dropping the `cursor` input and always returning page 1.

1. **Page 1** – Call `session.toolkits({ limit: 2 })` against the global toolkit catalog
2. **Cursor returned** – Assert the response includes a `cursor` (catalog has > 2 toolkits on any project)
3. **Page 2** – Call `session.toolkits({ limit: 2, cursor })` with the returned cursor
4. **Advancement** – Assert page 2 slugs do not overlap page 1 slugs

If the cursor is silently stripped, page 2 would equal page 1 and the overlap assertion fails.
