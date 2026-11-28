# CLI `composio upgrade` Test

Verifies that the compiled Linux CLI atomically replaces its running executable.

The suite covers both the installed `/usr/local/bin/composio` path and a copied executable. Each case checks the inode replacement, executable bit, upgrade result, absence of Linux busy-file errors, and a subsequent `composio version` invocation.

Those bundles carry no `release-manifest.json`, so the CLI checks them against the companion names compiled into itself. Two more bundles carry one: a bundle that omits the generation runtime and every legacy placeholder still upgrades and runs, and installs its manifest; a bundle whose manifest requires a newer CLI than the installed `release-tag.txt` records is refused with the install left untouched.

## Running

```bash
pnpm test:e2e:cli
```
