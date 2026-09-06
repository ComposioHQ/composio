# Plan 002: Harden CI — least-privilege tokens, fork-PR secret guards, and a real audit gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b2334fb8c..HEAD -- .github/workflows`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (composes with plan 001; if both run, rebase whichever lands second)
- **Category**: security / dx
- **Planned at**: commit `b2334fb8c`, 2026-07-03

## Why this matters

This is a public, popular repo weeks from v1. Three gaps: (1) ~20 workflows have no top-level `permissions:` block, so their `GITHUB_TOKEN` inherits the repo/org default — if that default is write, every PR-triggered job that executes project code holds a write token; (2) in `ts.test-e2e.yml`, the Deno and CLI jobs have no missing-secret guard at all, and the Node/Cloudflare guards only skip for `dependabot[bot]` — so every external contributor's fork PR fails red on E2E jobs (fork PRs get no secrets), which is a terrible first-contribution experience on required checks; (3) `pnpm audit` runs with `continue-on-error: true` and only ever comments — a critical advisory in production dependencies never fails CI.

## Current state

- Workflows with NO top-level `permissions:` block (some have job-level blocks, which are kept): `claude.yml`, `claude-code-doc-review.yml`, `cli.test-installation.yml`, `docs-check-links.yml`, `docs-tests.yml`, `docs-typescript-check.yml`, `docs-update-data.yml`, `docs.changelog-notification.yml`, `docs.changelog-to-docs.yml`, `docs.health-check.yml`, `docs.sdk-change-sync.yml`, `docs.sync-connect-clients.yml`, `generate-sdk-docs.yml`, `py.release.yml`, `py.test.yml`, `py.check.yaml`, `ts.audit.yml`, `ts.build.yml`, `ts.release.yml`, `ts.test-e2e.yml`, `ts.test.yml`, `ts.typecheck.yml`, `docs-search-sync.yml`. Good exemplars that already do it right: `build-cli-binaries.yml:30` (`permissions: contents: write` at top), `issue-triage.yml:13-16`, `stale.yml:9`, `cli.install-health-check.yml:8`.
- `ts.test-e2e.yml:88-110` — the Node job's guard (the pattern to replicate):
  ```yaml
  - name: Check API keys
    id: api-keys
    run: |
      missing=()
      for name in COMPOSIO_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY; do
        if [ -z "${!name}" ]; then
          missing+=("$name")
        fi
      done

      if [ "${#missing[@]}" -gt 0 ]; then
        echo "available=false" >> "$GITHUB_OUTPUT"
        if [ "$GITHUB_ACTOR" = "dependabot[bot]" ]; then
          echo "::notice::Skipping secret-backed Node.js E2E tests for Dependabot; missing ${missing[*]}."
          exit 0
        fi

        printf '::error::%s is not set\n' "${missing[@]}"
        exit 1
      fi

      echo "available=true" >> "$GITHUB_OUTPUT"
  ```
  and subsequent steps are gated with `if: steps.api-keys.outputs.available == 'true'` (`:112-125`).
- `ts.test-e2e.yml:130-175` (Deno job) and `:178-225` (CLI job) — NO guard; they run `pnpm run test:e2e:deno` / `test:e2e:cli` unconditionally. The Cloudflare job (`:261-283`) has a guard identical in spirit to the Node one.
- `ts.audit.yml:42-45`:
  ```yaml
  - name: Run pnpm audit (production dependencies only)
    id: audit
    continue-on-error: true
    run: pnpm audit --prod > audit-output.txt 2>&1
  ```
  followed by comment-posting steps gated on same-repo PRs only.
- Convention: SHA-pinned actions with `# vX.Y.Z` comments; two-space YAML indent.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Workflow syntax | `actionlint .github/workflows/*.yml .github/workflows/*.yaml` (if installed; otherwise skip) | no errors |
| Grep gates | see Done criteria | |

## Scope

**In scope**:
- Every workflow file listed in "Current state" as missing top-level `permissions:`
- `.github/workflows/ts.test-e2e.yml` (fork guards)
- `.github/workflows/ts.audit.yml` (audit gate)

**Out of scope**:
- `.github/actions/**` composites.
- Changing what any workflow *does* beyond permissions/guards/audit-gate — no step reordering, no version bumps.
- `issue-triage.yml`, `stale.yml`, `build-cli-binaries.yml`, `cli.install-health-check.yml` — already have permissions blocks.
- Narrowing `claude-code-doc-review.yml`'s `--allowedTools "Bash(*)"` — flagged in the audit but it's a maintainer judgment about agent ergonomics; see plans/README.md backlog.

## Git workflow

- Branch from `next`: `advisor/002-ci-hardening`
- Conventional commit, e.g. `ci: add least-privilege permissions and fork-pr secret guards`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add top-level least-privilege permissions everywhere

For each workflow in the "Current state" list, add at top level (after `name:`/`on:`, before `jobs:`):

```yaml
permissions:
  contents: read
```

Rules:
- If a job in that workflow already has a job-level `permissions:` block (e.g. `ts.test.yml:41-42` has `pull-requests: write`, `ts.audit.yml:25-26` too), KEEP the job-level block — job-level overrides top-level, so the job still gets what it needs.
- For workflows whose jobs push commits, create PRs, or create releases (`ts.release.yml`, `py.release.yml`, `docs-update-data.yml`, `docs.changelog-to-docs.yml`, `docs.sync-connect-clients.yml`, `docs.sdk-change-sync.yml`, `generate-sdk-docs.yml`, `claude.yml`, `claude-code-doc-review.yml`, `docs.changelog-notification.yml`), first read the workflow and identify what its steps actually do (look for `git push`, `gh pr create`, `gh release`, `peter-evans/create-pull-request`, comment actions, `id-token` needs). Give the *job* the permissions it demonstrably needs (e.g. `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write` for PyPI trusted publishing in `py.release.yml`), and keep the top level at `contents: read`. If you cannot determine what a step needs, leave that entire workflow untouched and list it in your final report instead of guessing.

**Verify**: `grep -L "^permissions:" .github/workflows/*.yml .github/workflows/*.yaml` → empty output, or contains only workflows you deliberately skipped and reported.

### Step 2: Add secret guards to the Deno and CLI E2E jobs

In `ts.test-e2e.yml`, add a "Check API keys" step to the Deno job (`test-e2e-deno-docker`) and the CLI job (`test-e2e-cli-docker`), copying the Node job's step verbatim with two changes:
1. The Deno/CLI required vars are `COMPOSIO_API_KEY OPENAI_API_KEY` (no `ANTHROPIC_API_KEY` — match each job's `env:` block).
2. Broaden the skip condition in ALL FOUR jobs (Node, Deno, CLI, Cloudflare) from dependabot-only to "dependabot or fork PR". Compute fork status via step env to keep `${{ }}` out of the shell body:
   ```yaml
   - name: Check API keys
     id: api-keys
     env:
       IS_FORK_PR: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.fork }}
     run: |
       missing=()
       for name in COMPOSIO_API_KEY OPENAI_API_KEY; do
         if [ -z "${!name}" ]; then
           missing+=("$name")
         fi
       done

       if [ "${#missing[@]}" -gt 0 ]; then
         echo "available=false" >> "$GITHUB_OUTPUT"
         if [ "$GITHUB_ACTOR" = "dependabot[bot]" ] || [ "$IS_FORK_PR" = "true" ]; then
           echo "::notice::Skipping secret-backed E2E tests; missing ${missing[*]}."
           exit 0
         fi

         printf '::error::%s is not set\n' "${missing[@]}"
         exit 1
       fi

       echo "available=true" >> "$GITHUB_OUTPUT"
   ```
   Place it after "Install Dependencies"/"Build" so non-secret build breakage still surfaces on fork PRs. Gate every subsequent step of the Deno and CLI jobs with `if: steps.api-keys.outputs.available == 'true'`.

**Verify**: `grep -c "Check API keys" .github/workflows/ts.test-e2e.yml` → `4`. `grep -c "IS_FORK_PR" .github/workflows/ts.test-e2e.yml` → `4`.

### Step 3: Make the audit fail on high/critical advisories

In `ts.audit.yml`, keep the existing advisory-comment flow intact and append one gating step at the end of the job:

```yaml
- name: Fail on high/critical advisories
  run: pnpm audit --prod --audit-level=high
```

Net behavior: any advisory still produces the PR comment; only high/critical advisories turn the job red.

**Verify**: `grep -n "audit-level=high" .github/workflows/ts.audit.yml` → one match, positioned after the comment-posting steps.

## Test plan

CI config only. Gates: the greps above plus `actionlint` if available. If the operator allows a draft PR from a fork (or a test fork), confirm: E2E jobs show the skip notice instead of failing, and workflows still pass on a same-repo branch.

## Done criteria

- [ ] `grep -L "^permissions:" .github/workflows/*.yml .github/workflows/*.yaml` → empty (or only deliberately-skipped files, reported).
- [ ] All four E2E jobs in `ts.test-e2e.yml` have the guard with fork skip; Deno/CLI steps gated on `steps.api-keys.outputs.available`.
- [ ] `ts.audit.yml` fails on `--audit-level=high` but keeps the comment flow.
- [ ] `git status` shows only in-scope workflow files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- A workflow's job needs permissions you cannot determine from its steps — skip it and report; do not guess write scopes.
- The Node/Cloudflare guard excerpts don't match the live file (drift).
- `pnpm audit --prod --audit-level=high` currently fails on `next` — report the advisory instead of shipping a permanently-red gate (the gate should land together with the dependency fix).

## Maintenance notes

- New workflows should copy the top-level `contents: read` + job-level opt-up pattern; consider adding this to `.agents/skills/repo-guidance`.
- Reviewer scrutiny: the release workflows' job-level permissions — too narrow breaks releases, which are the highest-cost failures in this repo. Test with a dry-run tag on a fork if unsure.
- Deferred: narrowing `claude-code-doc-review.yml` `--allowedTools "Bash(*)"`; org-level default token permission setting (repo Settings → Actions, not in-repo).
