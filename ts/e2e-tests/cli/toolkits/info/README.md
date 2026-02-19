# CLI `composio toolkits info` Test

Verifies that `composio toolkits info <slug>` returns detailed toolkit JSON in piped mode, handles invalid slugs gracefully, and supports stdout redirection.

## What It Tests

| Test | Description |
| --- | --- |
| Valid slug | `info gmail` returns JSON object with name, slug, meta, auth_config_details |
| Stdout redirection | `info gmail > out.json` captures the JSON in the file |
| Invalid slug | `info nonexistent_toolkit_xyz12345` exits 0, empty stdout |
| Missing slug | `info` (no arg) exits 0, empty stdout |

## Requirements

- `COMPOSIO_API_KEY` (**required**) — Composio API key passed to the container

## Running

```bash
pnpm test:e2e:cli
```
