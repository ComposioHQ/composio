---
description: Build the CLI binary from source and test it locally by running commands against the built binary.
---

# CLI Test

Build the Composio CLI binary from source and test it by running commands directly.

## Build Steps

Run these commands sequentially from the monorepo root:

```bash
# 1. Install dependencies
pnpm install

# 2. Build all packages (CLI depends on core, client, ts-builders, etc.)
pnpm turbo build

# 3. Build the standalone binary
pnpm --dir ts/packages/cli build:binary
```

The binary is output to `ts/packages/cli/dist/composio`.

## Testing the Binary

Run commands directly against the built binary:

```bash
./ts/packages/cli/dist/composio version
./ts/packages/cli/dist/composio whoami
./ts/packages/cli/dist/composio --help
```

By default the binary uses your existing Composio CLI auth (stored in `~/.composio/user-config.json`). No extra setup needed — just build and run.

## Testing Against Staging or Preview Environments

To test against staging instead of production, export these env vars before running the binary:

```bash
export COMPOSIO_BASE_URL=https://staging-backend.composio.dev
export COMPOSIO_WEB_URL=https://staging-platform.composio.dev
```

Or use the shorthand:

```bash
export COMPOSIO_ENVIRONMENT=staging
```

For a preview environment, set the URLs to the preview backend and dashboard:

```bash
export COMPOSIO_BASE_URL=<preview-backend-url>
export COMPOSIO_WEB_URL=<preview-dashboard-url>
```

Then re-authenticate against that environment:

```bash
./ts/packages/cli/dist/composio login
```

## Reference Files

| File | Purpose |
|---|---|
| `ts/packages/cli/scripts/build-binary.ts` | Binary build script |
| `ts/packages/cli/dist/composio` | Built binary output |
| `ts/packages/cli/src/effects/app-config.ts` | Env var config resolution |
| `ts/packages/cli/src/constants.ts` | Default and staging URLs |
