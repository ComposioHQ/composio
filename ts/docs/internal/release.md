# Release Process

This document outlines the release processes for the Composio SDK. We support both automated releases through GitHub Actions and manual releases when needed.

## CLI Binary Release Process

The CLI binary release process is separate from npm publishing.

- `@composio/cli` is marked private and is not published to npm via Changesets.
- CLI binaries are built and published as GitHub Release assets by `.github/workflows/build-cli-binaries.yml`.
- Install and upgrade flows (`install.sh` and `composio upgrade`) download binaries from GitHub Releases.
- `composio upgrade --beta` resolves the newest CLI prerelease from GitHub Releases.

### Triggers

The CLI binary workflow supports two entry points:

- Beta release: the auto-generated Changesets release PR titled `Release: update version`
- Stable release: manual `workflow_dispatch`, but only from an existing beta release tag

### Beta CLI Release

When the Changesets release PR is opened or updated, the workflow:

1. Reads the bumped CLI version from `ts/packages/cli/package.json`
2. Publishes a prerelease tag in the form `@composio/cli@<version>-beta.<pr-number>`
3. Attaches the built binaries to that prerelease

### Stable CLI Release

When running **Build CLI Binaries** manually:

1. Enter an existing beta tag (for example `@composio/cli@1.2.3-beta.456`)
2. The workflow verifies that the beta release already exists and is marked as a prerelease
3. The workflow checks out the exact commit associated with that beta release
4. The workflow rebuilds the binaries and publishes the stable release under `@composio/cli@<version>`

### What the workflow does

1. Builds CLI binaries for Linux/macOS (x64 + arm64)
2. Creates platform zip archives (`composio-<platform>.zip`)
3. Publishes assets to the beta or stable GitHub Release
4. Runs `.github/workflows/cli.test-installation.yml` to validate installation paths and shell integration

### Notes

- Stable promotion is intentionally gated on an existing beta release so the shipped stable binaries always correspond to a tested beta artifact.

## Automated Release Process

The automated release process is triggered when code is merged into the `main` branch or manually through GitHub Actions.

### Requirements

- `NPM_TOKEN` secret must be configured in GitHub repository settings
- `CI_BOT_TOKEN` secret for GitHub authentication
- All changes must be documented using Changesets
- All quality checks must pass

### Using Automated Release

1. **For Regular Releases (via main branch)**

   - Make sure your changeset is added to the PR you are merging to main. Run `pnpm changeset` on your branch before submiting the PR
   - Get your PR merged to main
   - The workflow will automatically:
     - Create a release PR
     - Publish packages when the release PR is merged

2. **For Manual Triggers**
   - Go to GitHub Actions
   - Select "TS SDK Release" workflow
   - Click "Run workflow" on main branch
   - Monitor the workflow progress

## Manual Release Process

The manual release process is available for cases where direct control over the release process is needed.

### Prerequisites

- Node.js (version: `20.19.0`)
- Bun (version: `1.3.6`)
- pnpm (version: `10.28.0`)
- Access to npm registry
- Write access to the repository

### Steps

1. **Prepare for Release**

   ```bash
   # Ensure you're on the latest main
   git checkout main
   git pull origin main

   # Install dependencies
   pnpm install

   # Run quality checks
   pnpm build
   pnpm check:peer-deps
   ```

2. **Create Changeset**

   ```bash
   pnpm changeset
   ```

   - Select affected packages
   - Choose version bump type (major/minor/patch)
   - Write a detailed change description
   - Commit the generated changeset file

   For pre-releases:

   ```bash
   pnpm changeset:pre-enter
   pnpm changeset
   ```

3. **Version Packages**

   ```bash
   pnpm changeset:version
   ```

   - Review the version changes
   - Commit the package bumps

4. **Publish Packages**

   ```bash
   # Ensure you're logged in to npm
   npm login

   # Publish
   pnpm changeset:release
   ```

### Troubleshooting

1. **Authentication Issues**

   - Ensure you're logged in to npm (`npm login`)
   - Check npm token validity
   - Verify registry settings in `.npmrc`

2. **Build Failures**

   - Clear node_modules: `pnpm clean`
   - Reinstall dependencies: `pnpm install`
   - Check for peer dependency issues

3. **Version Conflicts**
   - Check package.json versions
   - Verify changeset entries
   - Review git tags

## Best Practices

1. **Changesets**

   - Write clear, descriptive changeset messages
   - Include breaking changes prominently
   - Reference relevant issues/PRs

2. **Version Management**

   - Follow semver strictly
   - Document breaking changes
   - Update peer dependencies appropriately

3. **Quality Assurance**
   - Run all tests before release
   - Check bundle sizes
   - Verify documentation updates

## Post-Release

1. **Verification**

   - Check npm registry for new versions
   - Verify package installations
   - Test example projects

2. **Documentation**

   - Update changelog if needed
   - Update version numbers in docs
   - Announce breaking changes

3. **Cleanup**
   - Remove pre-release branches if any
   - Update release tickets/issues
   - Archive release artifacts
