---
description: Validate a Composio CLI beta release and promote it to a stable release by dispatching the CLI binary workflow with an existing beta tag.
---

# CLI Release Promotion

Use this skill when working on the Composio CLI release pipeline or when an agent needs to test a beta CLI binary and trigger the final stable promotion.

## What This Covers

- Finding the beta release tag produced from the Changesets release PR
- Smoke-testing that beta release through the existing installation path
- Promoting only an existing beta release to a stable CLI release

## Beta Release Model

- Beta releases are created by `.github/workflows/build-cli-binaries.yml`
- They are triggered from the Changesets release PR titled `Release: update version`
- Beta tags use the form `@composio/cli@<version>-beta.<pr-number>`
- Stable releases are promoted manually from an existing beta tag through the same workflow

## Validate The Beta

Pick the beta tag you intend to promote, then test it before promotion.

Use the existing installation health check workflow if you only need repo-side validation:

```bash
gh workflow run cli.test-installation.yml -f version='@composio/cli@0.2.18-beta.123'
```

For a local smoke test, install that exact beta binary and verify the upgrade path:

```bash
curl -fsSL https://raw.githubusercontent.com/ComposioHQ/composio/main/install.sh | bash -s -- '@composio/cli@0.2.18-beta.123'
composio --version
composio upgrade --beta
```

`composio upgrade --beta` should stay on the beta channel and resolve the newest prerelease, not the latest stable release.

## Promote To Stable

Only promote by referencing an existing beta tag.

Run the CLI binary workflow manually with that beta tag:

```bash
gh workflow run build-cli-binaries.yml -f beta_tag='@composio/cli@0.2.18-beta.123'
```

The workflow will:

- verify the beta release exists
- reject non-prerelease tags
- derive the stable tag `@composio/cli@0.2.18`
- rebuild from the beta release's recorded commit
- publish the stable GitHub release

## Reference Files

Read these when you need implementation details:

- `.github/workflows/build-cli-binaries.yml`
- `ts/packages/cli/src/commands/upgrade.cmd.ts`
- `ts/packages/cli/src/services/upgrade-binary.ts`
- `ts/docs/internal/release.md`
