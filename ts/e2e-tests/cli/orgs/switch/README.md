# CLI `composio orgs switch` Test

Verifies that `composio orgs switch --limit <n>` uses the provided limit, persists the selected global org, and returns machine-readable JSON in piped mode.

## What It Tests

| Test | Description |
| --- | --- |
| Limit passthrough | `--limit 2` is sent to the org list API |
| Global org selection | The first displayed org is stored in `user_data.json` |
| JSON stdout | The command returns `{ "scope": "global", "org_id": ... }` |

## Requirements

None. The suite starts a local mock API server and points the Dockerized CLI to it.

## Running

```bash
pnpm test:e2e:cli
```
