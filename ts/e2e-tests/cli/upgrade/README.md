# CLI `composio upgrade` Test

Verifies that the compiled Linux CLI atomically replaces its running executable.

The suite covers both the installed `/usr/local/bin/composio` path and a copied executable. Each case checks the inode replacement, executable bit, upgrade result, absence of Linux busy-file errors, and a subsequent `composio version` invocation.

## Running

```bash
pnpm test:e2e:cli
```
