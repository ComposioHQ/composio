# CLI `composio dev toolkits info` Test

Verifies that `composio dev toolkits info <slug>` returns detailed toolkit JSON in piped mode, reports an invalid or missing slug on stderr with exit 1, and supports stdout redirection.

## What It Tests

| Test               | Description                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Valid slug         | `info gmail` returns JSON object with name, slug, meta, auth_config_details                          |
| Stdout redirection | `info gmail > out.json` captures the JSON in the file                                                |
| Invalid slug       | `info nonexistent_toolkit_xyz12345` exits 1, empty stdout, "not found" and the browse hint on stderr |
| Missing slug       | `info` (no arg) exits 1, empty stdout, the usage message on stderr                                   |

## Requirements

- `COMPOSIO_USER_API_KEY` (**required**) — Composio user API key passed to the container

## Running

```bash
pnpm test:e2e:cli
```
