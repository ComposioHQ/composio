# Plan 001: Refresh `actions/stale` without changing repository policy

> **Executor instructions**: Follow each step and run every verification. Stop
> on any condition listed below; do not improvise. When complete, update this
> plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 03291bfaa..HEAD -- .github/workflows/stale.yml .github/scripts/check-action-repos.sh`
> If either file changed, compare the live workflow and checker with the state
> below before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: maintenance
- **Planned at**: commit `03291bfaa`, 2026-08-03
- **Source PR**: [GitHub #4001](https://github.com/ComposioHQ/composio/pull/4001) ([Glen review](https://app.tryglen.com/review/ComposioHQ/composio/4001))

## Why this matters

The v11 action retains the configured inputs and Node 24 runtime while updating
its bundled dependencies. The current Dependabot head is green but predates the
current `next`, and scheduled workflow behavior is not exercised by PR CI.

## Current state

- `.github/workflows/stale.yml:18` pins `actions/stale` v10.4.0 at
  `1e223db275d687790206a7acac4d1a11bd6fe629`.
- The proposed v11.0.0 revision is
  `4391f3da665fdf50b6810c1a66712fb9ba21aa93`.
- Lines 19-46 configure issue and PR thresholds, labels, messages,
  `ascending`, `remove-stale-when-updated`, and `debug-only: false`.
- `.github/scripts/check-action-repos.sh` verifies that pinned action commits
  and action metadata exist.
- Manual dispatch is unsafe as a test because the workflow has write
  permissions and `debug-only` is false.

## Commands

| Purpose       | Command                                      | Expected result                         |
| ------------- | -------------------------------------------- | --------------------------------------- |
| Workflow lint | `actionlint .github/workflows/stale.yml`     | exit 0, no findings                     |
| Action pins   | `bash .github/scripts/check-action-repos.sh` | exit 0; v11 revision and metadata found |
| Patch hygiene | `git diff --check`                           | exit 0                                  |

## Scope

**In scope**:

- `.github/workflows/stale.yml`

**Out of scope**:

- Thresholds, labels, messages, permissions, cron schedule, and `debug-only`.
- Any manual or API dispatch of the workflow.
- Other workflow action pins.

## Git workflow

- Branch from the latest `origin/next`.
- Commit: `chore(deps): bump actions/stale to v11`
- Do not push, dispatch a workflow, or open a PR unless instructed.

## Steps

### Step 1: Refresh and validate the immutable revision

Confirm that v11.0.0 still resolves to the proposed commit and that its
`action.yml` exposes every input used in `.github/workflows/stale.yml`:

```bash
gh api repos/actions/stale/git/ref/tags/v11.0.0 --jq '.object.sha'
stale_metadata="$(mktemp)"
gh api 'repos/actions/stale/contents/action.yml?ref=v11.0.0' \
  --jq '.content' | base64 --decode > "$stale_metadata"
rg -n 'repo-token|days-before-stale|days-before-close|ascending|stale-issue-label|exempt-issue-labels|stale-issue-message|close-issue-message|stale-pr-label|exempt-pr-labels|stale-pr-message|close-pr-message|remove-stale-when-updated|debug-only' "$stale_metadata"
```

The first command must print `4391f3da665fdf50b6810c1a66712fb9ba21aa93`.
The `rg` command must print all 14 configured input names from the temporary
metadata file. If the tag moved or an input disappeared, stop.

### Step 2: Change only the pinned action line

Replace line 18 with:

```yaml
uses: actions/stale@4391f3da665fdf50b6810c1a66712fb9ba21aa93 # v11.0.0
```

**Verify**:

```bash
git diff -- .github/workflows/stale.yml
```

Expected: one deletion and one addition on the `uses:` line only.

### Step 3: Run static checks and obtain a fresh CI result

Run all commands in the Commands table. After a PR is opened by an authorized
operator, require all repository checks to finish on the rebased head. Observe
the next scheduled run after merge; do not manually dispatch it.

## Test plan

No new test is warranted for a one-line immutable action pin. Static metadata
validation, workflow lint, refreshed PR checks, and the next scheduled run are
the regression gates.

## Done criteria

- [ ] The workflow pins the verified v11.0.0 commit.
- [ ] No stale-policy input or permission changed.
- [ ] `actionlint` and `check-action-repos.sh` exit 0.
- [ ] Refreshed PR checks pass on the current `next` base.
- [ ] The workflow was not manually dispatched.
- [ ] Only `.github/workflows/stale.yml` changed.

## STOP conditions

- The v11.0.0 tag no longer resolves to the recorded commit.
- Any configured input is absent or renamed in v11 metadata.
- The action no longer uses a runner supported by GitHub-hosted runners.
- Validation requires changing stale policy or permissions.
