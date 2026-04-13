---
description: Release the CLI — diff features since last release, run /full-cli-test on them, and create a changeset PR with patch bump and test results.
---

# CLI Release

Orchestrates a CLI release by identifying what changed since the last release, testing those changes via `/full-cli-test`, and creating a changeset PR with a patch version bump.

## Background: Release Flow

The CLI uses a two-channel release system:

- **Beta (automatic):** Every push to `next` touching `ts/packages/cli/**` auto-builds binaries and creates a `@composio/cli@X.Y.Z-beta.<run>` prerelease. Also triggerable on any branch via `workflow_dispatch` → `build-beta`.
- **Stable (via changeset):** Merge a changeset PR → changeset bot creates "Release: update version" PR → merge that → `package.json` version changes → workflow detects the change and creates a stable release.

This skill handles the **changeset PR** side: identifying changes, testing, and opening the PR that kicks off the stable release pipeline.

## Overview

Two workstreams run **in parallel**:

1. **Testing** — Run `/full-cli-test` to validate the CLI binary (types/lint CI, local build, bundled build).
2. **Changeset PR** — Identify changes since the last release, create a changeset file, open a PR.

Once testing completes, update the PR description with test results.

## Step 1: Identify Changes Since Last Release

Find the last stable release tag for `@composio/cli`:

```bash
# Find the latest stable CLI release
gh release list --json tagName,isPrerelease --jq '[.[] | select(.tagName | startswith("@composio/cli@")) | select(.isPrerelease == false)] | last | .tagName'
```

Find the commit for that tag, then collect all commits between it and HEAD that touch the CLI:

```bash
git log --oneline -1 <tag>          # get the base commit
git log <base>..HEAD --oneline -- ts/packages/cli/
```

For each commit, read the commit message and understand what it does. Categorize changes as:
- **Features** — new commands, new flags, new capabilities
- **Fixes** — bug fixes, error handling improvements
- **Improvements** — refactors, performance, DX improvements

Also run a full diff to understand the scope:

```bash
git diff <base_commit>..HEAD -- ts/packages/cli/src/
```

## Step 2: Run /full-cli-test (Parallel Track 1)

Run the `/full-cli-test` skill. This executes:

1. **Phase 1:** Monitor CI for types/lint passing
2. **Phase 2:** Local binary build and test (including Slack integration test)
3. **Phase 3:** Bundled binary build and test via CI (including Slack integration test)

For Phase 3, trigger a beta build via `workflow_dispatch` → `build-beta` on the current branch:

```bash
gh workflow run build-cli-binaries.yml --ref <branch> -f action=build-beta
```

Then monitor the run, download the built binary artifact, and test it.

Track the results of each phase — you'll need them for the PR description.

## Step 3: Create Changeset PR (Parallel Track 2)

While testing runs, create the changeset and PR. Do this **in parallel** with Step 2.

### 3a. Create a new branch

```bash
git checkout -b cli-release/patch-<short-description>
```

### 3b. Write the changeset file

Create a changeset file at `.changeset/<descriptive-name>.md`. The format is:

```markdown
---
"@composio/cli": patch
---

<summary of all changes since last release>
```

The summary should be a concise but complete description of all changes. Use the categorized changes from Step 1. Example:

```markdown
---
"@composio/cli": patch
---

feat: add `composio manage triggers` command for listing and inspecting trigger types
fix: bundle MCP server into subagent helper for standalone binaries
fix: harden run subAgent structured output and logfile path propagation
improve: better error messages for missing auth configs
```

Use `patch` by default. Only use `minor` if explicitly requested by the user.

### 3c. Commit and push

```bash
git add .changeset/<name>.md
git commit -m "chore: add changeset for CLI patch release"
git push -u origin cli-release/patch-<short-description>
```

### 3d. Open the PR

Create a PR against `next` with a clear description. Use a placeholder for test results that will be filled in once testing completes:

```bash
gh pr create --base next --title "chore: CLI patch release" --body "$(cat <<'EOF'
## Changes

<list of changes from Step 1, categorized>

## Changeset

- Bump: `@composio/cli` patch
- File: `.changeset/<name>.md`

## Testing

⏳ Full CLI test pipeline in progress...

_Test results will be updated once `/full-cli-test` completes._

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Step 4: Update PR with Test Results

Once `/full-cli-test` completes (all 3 phases), update the PR description with the actual test results:

```bash
gh pr edit <PR_NUMBER> --body "$(cat <<'EOF'
## Changes

<same list of changes>

## Changeset

- Bump: `@composio/cli` patch
- File: `.changeset/<name>.md`

## Testing

✅ Full CLI test pipeline passed

### Phase 1: CI Types/Lint
- Status: ✅ Passed
- <link to CI run if available>

### Phase 2: Local Binary Test
- `composio version`: ✅
- `composio whoami`: ✅
- `composio --help`: ✅
- Slack integration test: ✅

### Phase 3: Bundled Binary Test
- Binary version: <version>
- `composio version`: ✅
- `composio whoami`: ✅
- `composio --help`: ✅
- `composio run`: ✅
- `experimental_subAgent()`: ✅
- Slack integration test: ✅

### Features Tested
<for each new feature/fix identified in Step 1, describe how it was tested>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If any phase fails, update the PR description with the failure details and mark the PR as draft:

```bash
gh pr ready <PR_NUMBER> --undo  # Convert to draft
```

## Important Notes

- **Default to patch.** Only use `minor` or `major` if the user explicitly requests it.
- **Don't use `pnpm changeset` CLI** — create the `.changeset/*.md` file manually.
- **The changeset file format is strict:** YAML frontmatter with package name in quotes and bump type, then a blank line, then the description.
- **Feature-specific testing:** When identifying changes in Step 1, note any new commands or flags. During testing (Step 2), explicitly test those new features with the built binary beyond the standard test suite.
- **The PR targets `next`** — this is the main development branch.
- **Beta builds are automatic.** Every push to `next` touching CLI files creates a beta. The changeset PR is only needed to trigger the stable release pipeline.

## Reference Files

| File | Purpose |
|---|---|
| `ts/packages/cli/package.json` | Current CLI version |
| `.changeset/config.json` | Changeset configuration |
| `.github/workflows/build-cli-binaries.yml` | CI binary build + release workflow |
| `.github/workflows/ts.release.yml` | Changeset bot + npm publish |
| `ts/packages/cli/src/commands/` | CLI command implementations |
