# Docker CLI E2E Tests

## Architecture

CLI E2E tests run the compiled standalone `composio` binary inside scratch Debian Docker containers.

Key properties:

- Each suite lives under `ts/e2e-tests/cli/<suite-name>/`.
- Each suite has `e2e.test.ts` and `package.json`.
- Each command call runs in a fresh container.
- Runtime shell is POSIX `sh`.
- `HOME=/tmp`; auth and API state must come from env vars or command setup.
- stdout is not a TTY, so piped-mode output rules apply.

## Package Template

```json
{
  "name": "@e2e-tests/cli-<suite-name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:e2e": "bun test e2e.test.ts",
    "test:e2e:cli": "bun test e2e.test.ts"
  },
  "devDependencies": {
    "@e2e-tests/utils": "workspace:*"
  }
}
```

## Verification

Run from the repo root:

```bash
pnpm test:e2e:cli
```

Use focused Turbo filters when iterating on a single suite.
