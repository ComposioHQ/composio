# CLI Binary Release Policy

This document defines what makes a Composio CLI binary release installable via `curl -fsSL https://composio.dev/install | bash`.

## Release Tags

CLI binary releases use a dedicated tag namespace to decouple from SDK package releases:

| Tag pattern | Purpose | Example |
|---|---|---|
| `cli-v*` | CLI binary releases | `cli-v0.1.25` |
| `@composio/core@*` | TypeScript SDK packages (npm) | `@composio/core@0.6.3` |
| `v*` | Legacy SDK version tags | `v0.11.1` |

Only `cli-v*` tagged releases are considered for CLI binary installation.

## Required Assets

A CLI release is considered **complete** when all four platform binaries are present:

| Asset | Platform |
|---|---|
| `composio-linux-x64.zip` | Linux x86_64 |
| `composio-linux-aarch64.zip` | Linux ARM64 |
| `composio-darwin-x64.zip` | macOS Intel |
| `composio-darwin-aarch64.zip` | macOS Apple Silicon |

## "Latest" Criteria

The installer selects the most recent `cli-v*` release that:

1. Is not a draft
2. Is not a prerelease
3. Contains the matching `composio-{target}.zip` asset for the user's platform

If the newest release is missing assets, the installer falls back to the next most recent release that satisfies all criteria.

## Build Workflow

CLI binaries are built by `.github/workflows/build-cli-binaries.yml`:

- **Trigger:** Push to `cli-v*` tags, or manual `workflow_dispatch`
- **Process:** Builds on 4 platform matrix, creates draft release, validates all assets present, then publishes
- **Testing:** `.github/workflows/cli.test-installation.yml` runs the installer across 11+ OS/shell combinations after binaries are uploaded

## Manual Backfill

To rebuild binaries for an existing release:

```bash
gh workflow run build-cli-binaries.yml -f version=cli-v0.1.25
```
