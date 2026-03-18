# CLI `composio manage toolkits list` Test

Verifies that `composio manage toolkits list` returns toolkits as JSON in piped mode with correct `--query` filtering behavior.

## What It Tests

| Test | Description |
| --- | --- |
| Exact slug match | `--query gmail --limit 1` returns 1 item with slug "gmail" |
| Prefix search | `--query gmai --limit 1` returns 1 item (API supports prefix matching) |
| No fuzzy search | `--query gmal --limit 1` returns empty (backend doesn't support fuzzy search) |

## Requirements

- `COMPOSIO_USER_API_KEY` (**required**) — Composio user API key passed to the container

## Running

```bash
pnpm test:e2e:cli
```
