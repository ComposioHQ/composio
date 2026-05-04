# CLI `composio whoami` Test

Verifies that `composio whoami` prints the authenticated API key and respects stdout piping.

## Why This Exists

The CLI separates decoration (stderr) from data (stdout). This suite ensures:

- `composio whoami` exits with code 0
- stdout contains the API key passed via `COMPOSIO_USER_API_KEY`
- stderr is empty (no decoration leaks into piped output)
- Redirecting stdout to a file captures the clean API key

## What It Tests

| Test | Description |
| --- | --- |
| Exit code | `composio whoami` returns 0 |
| stdout | Output matches `COMPOSIO_USER_API_KEY` |
| stderr | Empty when piped |
| File redirect | `composio whoami > out.txt` captures the API key in the file |

## Requirements

- `COMPOSIO_USER_API_KEY` (**required**) — Composio user API key consumed by CLI

If `COMPOSIO_USER_API_KEY` is not set, the suite fails fast at startup.

## Isolation Tool

**Docker** with the CLI built from the current monorepo source.

## Running

```bash
pnpm test:e2e:cli
```
