# CLI `composio version` Test

Verifies that `composio version` prints the correct version string and respects stdout piping.

## Why This Exists

The CLI separates decoration (stderr) from data (stdout). This suite ensures:

- `composio version` exits with code 0
- stdout contains the version from `packages/cli/package.json`
- stderr is empty (no decoration leaks into piped output)
- Redirecting stdout to a file captures the clean version string

## What It Tests

| Test | Description |
| --- | --- |
| Exit code | `composio version` returns 0 |
| stdout | Output matches `package.json` version |
| stderr | Empty when piped |
| File redirect | `composio version > out.txt` captures the version in the file |

## Requirements

None. This suite does not require any environment variables.

## Isolation Tool

**Docker** with the CLI built from the current monorepo source.

## Running

```bash
pnpm test:e2e:cli
```
