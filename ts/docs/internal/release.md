# Release Process

This document outlines the release processes for the Composio SDK. We support both automated releases through GitHub Actions and manual releases when needed.

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

- Node.js (Latest LTS)
- pnpm (v10.8.0 or later)
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
