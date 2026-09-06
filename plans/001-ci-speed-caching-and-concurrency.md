# Plan 001: Stop CI from rebuilding the world — turbo/bun/uv caching and PR run cancellation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b2334fb8c..HEAD -- .github/workflows .github/actions turbo.jsonc`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (MED only for the turbo.jsonc typecheck-cache change, which has its own verification step)
- **Depends on**: none
- **Category**: perf / dx
- **Planned at**: commit `b2334fb8c`, 2026-07-03

## Why this matters

A single PR touching `ts/**` compiles the whole TypeScript workspace 5–8 times across parallel jobs (`ts.build`, `ts.test`, `ts.typecheck`, and every `ts.test-e2e` job each run `pnpm install` + a full turbo build), with zero build-cache reuse between jobs or runs — only the pnpm store is cached. Docs workflows re-download the full Bun dependency tree every run, the `py.test` matrix caches `~/.cache/pip` while actually installing through `uv` (which uses `~/.cache/uv`), and only 2 of 29 workflows declare `concurrency`, so pushing three commits to a PR runs three full copies of everything. This plan is pure CI mechanics: no runtime code, no public interface.

## Current state

- `.github/actions/setup-node-pnpm-bun/action.yml:87-94` — the shared composite caches ONLY the pnpm store:
  ```yaml
  - name: Cache pnpm store
    if: inputs.enable-caching == 'true'
    uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
    with:
      path: ${{ steps.pnpm-store.outputs.STORE_PATH }}
      key: ${{ runner.os }}-node${{ steps.pnpm-store.outputs.NODE_VERSION }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
  ```
  There is no cache of `.turbo` anywhere in `.github/` (verify: `grep -rn "\.turbo" .github/` returns nothing).
- `turbo.jsonc:21-24` — the `test` task declares the build's output as its own:
  ```jsonc
  "test": {
    "dependsOn": ["^build"],
    "outputs": ["dist/"]
  },
  ```
- `turbo.jsonc:57-64` — `typecheck` and `typecheck:tsc` are `"cache": false`.
- Only `build-cli-binaries.yml:191` (per-tag serialization) and `cli.bump-homebrew-tap.yml:16` declare `concurrency:`. No PR workflow cancels superseded runs.
- `.github/workflows/py.test.yml:58-79` — caches `~/.cache/pip` keyed on `python/pyproject.toml`, then installs with `uv pip install` (uv uses `~/.cache/uv`; the pip cache is dead weight).
- Docs workflows run `bun install` with no Bun cache: `docs-tests.yml:26-27`, `docs-check-links.yml`, `docs-typescript-check.yml`, `docs-search-sync.yml`, `docs-update-data.yml`, `docs.sdk-change-sync.yml:126-129`.
- Convention to preserve: every action `uses:` in this repo is SHA-pinned with a trailing `# vX.Y.Z` comment (e.g. `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0`). Match it exactly — reuse SHAs already present in the repo for the same action.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Build twice (cache check) | `pnpm run build:packages && pnpm run build:packages` | second run prints `FULL TURBO` |
| Typecheck | `pnpm run typecheck` | exit 0 |
| Workflow syntax | `actionlint .github/workflows/*.yml .github/workflows/*.yaml` (if `actionlint` is installed; otherwise skip) | no errors |
| Grep gates | see Done criteria | |

## Scope

**In scope** (the only files you may modify):
- `turbo.jsonc`
- `.github/actions/setup-node-pnpm-bun/action.yml`
- `.github/workflows/ts.build.yml`, `ts.test.yml`, `ts.typecheck.yml`, `ts.audit.yml`, `ts.test-e2e.yml`
- `.github/workflows/py.test.yml`, `py.check.yaml`
- `.github/workflows/docs-tests.yml`, `docs-check-links.yml`, `docs-typescript-check.yml`, `docs-search-sync.yml`, `docs-update-data.yml`

**Out of scope** (do NOT touch):
- Release/publish workflows: `ts.release.yml`, `py.release.yml`, `build-cli-binaries.yml`, `cli.bump-homebrew-tap.yml`, `cli.test-installation.yml`, `cli.install-health-check.yml` — they intentionally serialize instead of cancel, and must never restore possibly-stale build caches.
- `pnpm-lock.yaml`, any `package.json`, any source code.
- Turbo REMOTE cache (`TURBO_TOKEN`/`TURBO_TEAM`) — requires org secrets the executor cannot create. Local `.turbo` + actions/cache only.

## Git workflow

- Branch from `next`: `advisor/001-ci-caching`
- Conventional commits, e.g. `ci: cache turbo outputs and cancel superseded pr runs` (match style of `d722ee0c0 ci: validate python examples`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add concurrency cancellation to PR/push CI workflows

To each of `ts.build.yml`, `ts.test.yml`, `ts.typecheck.yml`, `ts.audit.yml`, `ts.test-e2e.yml`, `py.test.yml`, `py.check.yaml`, `docs-tests.yml`, `docs-check-links.yml`, `docs-typescript-check.yml`, add at top level (after `on:`, before `jobs:`):

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

`cancel-in-progress` is conditional so pushes to `next`/`master` still test every commit; only superseded PR runs are cancelled.

**Verify**: `grep -L "concurrency:" .github/workflows/ts.build.yml .github/workflows/ts.test.yml .github/workflows/ts.typecheck.yml .github/workflows/ts.audit.yml .github/workflows/ts.test-e2e.yml .github/workflows/py.test.yml .github/workflows/py.check.yaml .github/workflows/docs-tests.yml .github/workflows/docs-check-links.yml .github/workflows/docs-typescript-check.yml` → empty output.

### Step 2: Fix the `test` task outputs in turbo.jsonc

In `turbo.jsonc`, change the `test` task to declare no outputs (tests emit no cacheable artifact):

```jsonc
"test": {
  "dependsOn": ["^build"]
},
```

**Verify**: `pnpm run build:packages` exits 0, then `node -e "const s=require('fs').readFileSync('turbo.jsonc','utf8'); if(/\"test\":\s*{[^}]*dist/.test(s)) process.exit(1)"` → exit 0.

### Step 3: Enable turbo caching for typecheck — with a stale-pass check

In `turbo.jsonc`, remove `"cache": false` from the `typecheck` task (keep it on `typecheck:tsc` — that one is a rarely-used fallback and not worth the risk). `typecheck` has no outputs; turbo will cache the log replay keyed on the package's inputs and its dependencies' hashes, which is what we want.

Then prove it cannot serve a stale pass:
1. `pnpm run typecheck` → exit 0 (warm the cache).
2. Append `const __brokenProbe: number = 'x';` to the end of `ts/packages/core/src/index.ts`.
3. `pnpm run typecheck` → MUST fail (cache miss because the input changed).
4. `git checkout ts/packages/core/src/index.ts` to remove the probe.
5. `pnpm run typecheck` → exit 0 again.

If step 3 PASSES instead of failing, revert this step entirely (restore `"cache": false`) and note it in the plan status — that means the task's inputs are not hashed correctly and caching typecheck is unsafe.

**Verify**: the 5-step probe sequence above, plus `git status` shows only `turbo.jsonc` modified.

### Step 4: Cache `.turbo` in the TypeScript CI workflows

In `.github/actions/setup-node-pnpm-bun/action.yml`, after the "Cache pnpm store" step, add:

```yaml
- name: Cache turbo build outputs
  if: inputs.enable-caching == 'true' && inputs.enable-turbo-cache == 'true'
  uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
  with:
    path: .turbo/cache
    key: ${{ runner.os }}-turbo-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-turbo-
```

Add the input to the composite:

```yaml
enable-turbo-cache:
  description: 'Cache .turbo build outputs'
  required: false
  default: 'false'
```

Default `'false'` so nothing else changes behavior implicitly. Then opt in explicitly in the CI workflows that run turbo builds — `ts.build.yml`, `ts.test.yml`, `ts.typecheck.yml`, and all four build steps' jobs in `ts.test-e2e.yml` — by adding to their existing `uses: ./.github/actions/setup-node-pnpm-bun` step:

```yaml
with:
  enable-turbo-cache: 'true'
```

(For jobs that already pass `with:` values, add the key; do not add it to `ts.audit.yml` — it doesn't build.)

**Verify**: `grep -c "enable-turbo-cache: 'true'" .github/workflows/ts.build.yml .github/workflows/ts.test.yml .github/workflows/ts.typecheck.yml .github/workflows/ts.test-e2e.yml` → at least 1 per file (ts.test-e2e should have one per job that builds, 4 total).

### Step 5: Fix the uv cache in py.test.yml

In `.github/workflows/py.test.yml`, in the `test` matrix job, replace the pip cache step (lines ~58-64):

```yaml
- name: Cache uv dependencies
  uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: ~/.cache/uv
    key: uv-${{ matrix.python-version }}-${{ hashFiles('python/pyproject.toml', 'mise.toml') }}
    restore-keys: |
      uv-${{ matrix.python-version }}-
```

Leave the rest of the job as is (migrating it to the `setup-python-uv` composite is a nice-to-have explicitly deferred).

**Verify**: `grep -n "cache/pip" .github/workflows/py.test.yml` → no matches in the `test` job (other jobs unchanged); `grep -n "cache/uv" .github/workflows/py.test.yml` → at least 2 matches.

### Step 6: Cache Bun installs in docs workflows

To each of `docs-tests.yml`, `docs-check-links.yml`, `docs-typescript-check.yml`, `docs-search-sync.yml`, `docs-update-data.yml`, immediately before the `bun install` step, add:

```yaml
- name: Cache bun dependencies
  uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('docs/bun.lock') }}
    restore-keys: |
      ${{ runner.os }}-bun-
```

(If a workflow's `bun install` runs in a different working directory or the lockfile is named differently, check `ls docs/bun.lock*` and use the actual filename.)

**Verify**: `grep -l "bun/install/cache" .github/workflows/docs-tests.yml .github/workflows/docs-check-links.yml .github/workflows/docs-typescript-check.yml .github/workflows/docs-search-sync.yml .github/workflows/docs-update-data.yml` → lists all five files.

## Test plan

No unit tests — this is CI config. Verification is the grep gates above, the typecheck stale-pass probe in Step 3, the local double-build `FULL TURBO` check, and `actionlint` if available. If the operator allows pushing a draft PR, the real acceptance test is: second push to the PR cancels the first run's in-flight jobs, and job logs show cache restore hits.

## Done criteria

- [ ] All Step 1 workflows contain a `concurrency:` block; no release workflow gained one (`grep -l "concurrency:" .github/workflows/ts.release.yml .github/workflows/py.release.yml` → empty).
- [ ] `turbo.jsonc`: `test` has no `outputs`, `typecheck` has no `cache: false` (or Step 3 was reverted and noted).
- [ ] Typecheck stale-pass probe behaved correctly (fail on probe, pass after revert).
- [ ] `pnpm run build:packages` twice → second run `FULL TURBO`.
- [ ] py.test `test` job caches `~/.cache/uv`, not `~/.cache/pip`.
- [ ] Five docs workflows cache `~/.bun/install/cache`.
- [ ] `git status` shows only in-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Any "Current state" excerpt no longer matches the live file.
- The Step 3 probe passes with the type error present (stale cache) and you cannot cleanly revert.
- `actionlint` (if installed) reports errors you cannot resolve in two attempts.
- You find yourself editing a release workflow — that is out of scope by design.

## Maintenance notes

- If the org later adds Turbo remote cache (`TURBO_TOKEN`/`TURBO_TEAM`), remove the `.turbo` actions/cache steps — they'd be redundant.
- Reviewers should scrutinize: the conditional `cancel-in-progress` expression (must not cancel push builds on `next`), and that no release workflow was touched.
- Deferred: migrating py.test's `test` job to the `setup-python-uv` composite; trimming the `cli.test-installation.yml` npm-fallback matrix (see plans/README.md backlog).
