# Plan 003: Align the CLI on one maintained Effect release family

> **Executor instructions**: Follow each step and run every verification. Stop
> on any condition listed below; do not improvise. When complete, update this
> plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 03291bfaa..HEAD -- pnpm-workspace.yaml pnpm-lock.yaml ts/packages/cli/package.json .github/dependabot.yml`
> If any in-scope dependency changed, re-check the current peer matrix before
> editing.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `03291bfaa`, 2026-08-03
- **Source PR**: [GitHub #4004](https://github.com/ComposioHQ/composio/pull/4004) ([Glen review](https://app.tryglen.com/review/ComposioHQ/composio/4004))

## Why this matters

`@effect/printer-ansi@1.0.0` is an older package generation despite its higher
semver major. It removes the `@effect/printer-ansi/Ansi` export used by the
current CLI, causing 56 test suites and the CLI binary E2E build to fail. The
safe update is the maintained, coordinated 0.51 family.

## Current state

- `pnpm-workspace.yaml` catalogs `@effect/cli ^0.76.0`,
  `@effect/platform ^0.97.0`, and `effect ^3.22.0`.
- `ts/packages/cli/package.json` uses `@effect/printer` and
  `@effect/printer-ansi ^0.50.0` plus related Effect packages.
- Live npm peer metadata coordinates these targets:

| Package                                   | Target line |
| ----------------------------------------- | ----------- |
| `@effect/cli`                             | `^0.77.0`   |
| `@effect/printer`, `@effect/printer-ansi` | `^0.51.0`   |
| `@effect/platform`                        | `^0.97.1`   |
| `effect`                                  | `^3.22.1`   |
| `@effect/cluster`                         | `^0.60.2`   |
| `@effect/experimental`                    | `^0.61.1`   |
| `@effect/platform-bun`                    | `^0.91.2`   |
| `@effect/platform-node-shared`            | `^0.61.1`   |
| `@effect/rpc`                             | `^0.76.2`   |
| `@effect/sql`                             | `^0.52.1`   |
| `@effect/workflow`                        | `^0.19.1`   |

Keep `@effect/typeclass` on the compatible 0.41 line. Re-query peer metadata at
execution time and use the newest coordinated, 72-hour-eligible patch set.

## Commands

| Purpose          | Command                                                                                                                            | Expected result                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Resolve          | `mise exec -- pnpm install --lockfile-only`                                                                                        | exit 0, no peer errors                                |
| Reproducibility  | `CI=true mise exec -- pnpm install --frozen-lockfile`                                                                              | exit 0                                                |
| Dependency graph | `mise exec -- pnpm --filter @composio/cli list @effect/cli @effect/printer @effect/printer-ansi @effect/platform effect --depth 1` | only the coordinated current family; no printer 1.0.0 |
| Types            | `mise exec -- pnpm --filter @composio/cli typecheck`                                                                               | exit 0                                                |
| Unit tests       | `mise exec -- pnpm --filter @composio/cli test`                                                                                    | all pass                                              |
| Package build    | `mise exec -- pnpm --filter @composio/cli build`                                                                                   | exit 0                                                |
| Binary build     | `mise exec -- pnpm build:binary`                                                                                                   | exit 0                                                |
| CLI E2E          | `mise exec -- pnpm test:e2e:cli`                                                                                                   | all pass                                              |

## Scope

**In scope**:

- `pnpm-workspace.yaml`
- `ts/packages/cli/package.json`
- `.github/dependabot.yml`
- `pnpm-lock.yaml` through pnpm only

**Out of scope**:

- `ts/vendor/**` and CLI source files.
- Patching missing package exports or adding overrides for obsolete packages.
- Changesets; `@composio/cli` is excluded from Changesets.

## Git workflow

- Branch from the latest `origin/next`.
- Commit: `chore(cli): align Effect dependencies`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Confirm the maintained peer matrix

Query npm metadata for the listed targets. Confirm that the selected
`@effect/cli` version peers on the selected printer, platform, and Effect lines.
Confirm that `@effect/printer-ansi@1.0.0` still peers on legacy `@effect/io` or
`@effect/data`. If upstream republished 1.x for the current generation, stop and
re-plan instead of adding the ignore below.

### Step 2: Update the coordinated dependency set

Update catalog entries in `pnpm-workspace.yaml` and direct CLI development
dependencies in `ts/packages/cli/package.json` as one unit. Do not update only
the printer package. Generate the lockfile, prove frozen install, and inspect
the dependency graph with the Commands table.

**Verify**:

```bash
rg -n '"@effect/(cluster|experimental|printer|printer-ansi|rpc|sql|typeclass|workflow)"' \
  ts/packages/cli/package.json
rg -n "'@effect/(cli|platform|platform-bun|platform-node-shared)'|effect:" pnpm-workspace.yaml
```

Expected: every entry belongs to the coordinated family and printer 1.0.0 is
absent from `pnpm-lock.yaml`.

### Step 3: Prevent the invalid major proposal from recurring

Add this ignore to the npm update block in `.github/dependabot.yml`:

```yaml
ignore:
  - dependency-name: '@effect/printer-ansi'
    versions: ['1.0.0']
```

**Verify**:

```bash
yq -e '.updates[] | select(.package-ecosystem == "npm") | .ignore[] | select(.dependency-name == "@effect/printer-ansi")' .github/dependabot.yml
```

Expected: exit 0 and exactly one matching ignore entry.

### Step 4: Exercise the CLI contract

Run typecheck, unit tests, package build, binary build, and CLI E2E from the
Commands table. A source change is not part of this dependency maintenance
plan; stop if one appears necessary.

## Test plan

No new test is required. The regression is an import and binary-build failure
already covered by CLI unit tests and scratch E2E.

## Done criteria

- [ ] The CLI resolves one current, peer-compatible Effect family.
- [ ] Neither printer 1.0.0 nor legacy `@effect/io`/`@effect/data` enters the lockfile.
- [ ] Dependabot ignores only `@effect/printer-ansi@1.0.0`.
- [ ] Frozen install, CLI typecheck, tests, builds, and E2E pass.
- [ ] No vendor, source, or Changeset file changed.

## STOP conditions

- Current peer metadata differs from the documented coordinated matrix.
- Resolution introduces printer 1.0.0, `@effect/io`, or `@effect/data`.
- pnpm reports unresolved or incorrectly satisfied Effect peer dependencies.
- Passing the gates requires CLI source edits, an override, or a vendor change.
