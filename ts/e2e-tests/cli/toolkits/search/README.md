# CLI `composio toolkits search` Test

Verifies that `composio toolkits search <query>` returns matching toolkits as JSON in piped mode, respects `--limit`, supports stdout redirection, and handles queries with no results.

## What It Tests

| Test | Description |
| --- | --- |
| Known query | `search gmail` returns JSON array with "gmail" as first result |
| With limit | `search gmail --limit 1` returns exactly 1 element |
| Stdout redirection | `search gmail --limit 1 > out.json` captures JSON in the file |
| No results | `search xyznonexistent_abc_12345` returns empty stdout |

## Requirements

- `COMPOSIO_API_KEY` (**required**) — Composio API key passed to the container

## Running

```bash
pnpm test:e2e:cli
```
