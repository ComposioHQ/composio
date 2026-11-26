# CLI `composio run` Test

Verifies that `composio run` forwards the script's exit status to the caller and that
the run log it advertises survives the process.

## Why This Exists

The CLI runs the script in its own process. The handler returns a typed failure when the script
exits nonzero, and the runner passes that status to the OS. This suite checks the actual exit
status of the compiled executable.

The `RUN_LOG_FILE=` path printed on stderr has the same problem: it is only useful if the file
outlives the process that printed it, which regressed once when the log lived inside a scoped
temp directory.

## What It Tests

| Test               | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| Exit forwarding    | `composio run 'process.exit(7)'` exits 7                               |
| Successful run     | An inline script exits 0 and its stdout reaches the caller             |
| Missing script     | `composio run` with no code and no `--file` exits non-zero and says so |
| Run log durability | The announced `RUN_LOG_FILE` path still exists after the process exits |

## Requirements

None. This suite does not require any environment variables or network access.

## Isolation Tool

**Docker** with the CLI built from the current monorepo source.

## Running

```bash
pnpm test:e2e:cli
```
