---
title: Step 5 — Final 0.x Warning Release and Migration Bridge - Plan
type: feat
date: 2026-07-03
origin: road-to-v1.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Step 5 — Final 0.x Warning Release and Migration Bridge - Plan

## Goal Capsule

- **Objective:** Ship one last 0.x release per SDK whose only job is to warn — every API the deprecation ledger removes or renames warns at the point of use and names its replacement — and build the four migration carriers: the TypeScript codemod, the Python migration path, the `v1-migration` agent skill, and the "Upgrading to 1.0" docs with a version selector.
- **Authority:** `docs/decisions/sdk-v0-to-v1-migration.md` (the staged transition); `docs/decisions/sdk-v1-deprecation-ledger.md` (plan 003 U4) is the input contract — this plan executes it and must not invent removals the ledger does not carry.
- **Stop conditions:** cutting the actual releases (U7) is release-authority work — prepare, verify, and hand off; do not tag or publish without explicit authorization. If the ledger is not final (any `TBD` rows), stop before U1.
- **Depends on:** Steps 3 and 4 complete (plans 003, 004) — the full set of removals, renames, and new codes must be known.

---

## Product Contract

### Summary

A user upgrading through the final 0.x sees, in their editor and logs, exactly what 1.0 changes and where to go. Concretely: TS `@deprecated` annotations and Python `DeprecationWarning`s for every ledger row that is not `wire-mirror-keep`; the dual error codes from plan 004 (`catalogCode` + `matchesCode`) ship here; and the four migration carriers exist and are linked from every warning message where a URL fits.

### Requirements

Warning sweep:

- R1. Every `rename-bridge`, `remove-at-1.0`, and `server-retired` ledger row warns in the final 0.x: TS via `@deprecated` JSDoc naming the replacement (editor-visible), Python via `DeprecationWarning` raised once per process at the call site (matching the `initiate()` pattern).
- R2. Warning messages follow one template: what changes at 1.0, the replacement (or "removed, no replacement"), and the migration-guide URL. No warning without a destination.
- R3. The plan-004 dual error codes (`catalogCode`, `matchesCode`, Python `code` attributes) are included in this release so handlers can move before the 1.0 prefix flip.

Migration tooling:

- R4. A TypeScript codemod package applies the mechanical renames in one command; it covers, at minimum: `@composio/google` → `@composio/gemini` import/package renames, `composio.toolRouter` → `composio.sessions`, `workbench` → `sandbox` option/method renames, `experimental.updateAcl` → `connectedAccounts.updateAcl`, error-code *comparison* rewrites to `matchesCode` (KTD1/U2 — not blind literal replacement), and `initiate(` → `link(` call-site flagging (flag, not rewrite — argument shapes differ).
- R5. A documented Python migration path exists: the migration guide carries the full old→new table, and a LibCST-based script automates the safe subset (`proxy` → `proxy_execute`, `tool_router` → `sessions`, `list` → `list_types` on triggers, import updates). Publishing it as a package is not required; running from the repo/docs is acceptable.
- R6. A `v1-migration` agent skill under `.agents/skills/` guides coding agents through the upgrade per the repo's skill conventions (`skill-maintenance`), including the ledger table, codemod invocation, and post-migration verification steps.
- R7. One consolidated "Upgrading to 1.0" docs page per language pairs every removed/renamed API with its replacement and points at the codemod; the docs site serves v0 and v1 content side by side via a version selector.

Release:

- R8. The final 0.x releases are prepared (changesets for TS core + affected providers; Python version bump + changelog) with release notes that lead with "this release only warns."

### Scope Boundaries

- No API is removed in this step; removal is Step 6 (plan 006). The exports-map removal of `./generated` prepared in plan 003 U3 ships here as a warned change only if the ledger classifies it as such — otherwise it lands at 1.0.
- Codemod coverage is the mechanical subset; behavioral migrations (e.g. `initiate()` argument mapping to `link()`) are guide + skill territory, deliberately not auto-rewritten.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Codemod ships as `@composio/codemod`** in `ts/packages/codemod`, public on npm, invoked as `npx @composio/codemod v1 [paths]`. jscodeshift transforms, one file per rename family, a `v1` composite command running all of them. Rationale: the repo already publishes multiple packages via changesets; a public runnable is the one-command promise the migration ADR makes. Named-transform layout:

  ```text
  ts/packages/codemod/
    src/cli.ts                  # npx entry: `v1` runs the full set
    src/transforms/
      google-to-gemini.ts       # imports + package.json hints
      tool-router-to-sessions.ts
      workbench-to-sandbox.ts
      experimental-update-acl.ts
      error-code-comparisons.ts # rewrites code comparisons to matchesCode (see U2)
      initiate-flagger.ts       # comments call sites, no rewrite
    test/__testfixtures__/      # jscodeshift fixture pairs per transform
  ```

- **KTD2 — Python automation is a repo script, not a package.** `python/scripts/codemod_v1.py` (LibCST), documented in the guide, runnable via `uvx --from libcst python python/scripts/codemod_v1.py` or a plain `python` invocation with LibCST installed. Rationale: the Python rename set is small (KTD1 table in plan 004); a published package adds release surface for marginal value. *(settle-at-execution: if the rename set grows past ~10 families, revisit packaging as `composio-codemod`.)*
- **KTD3 — Warning template** (R2), frozen here so all sweeps match:
  - TS: `@deprecated Removed in v1.0. Use {replacement}. See {GUIDE_URL}#{anchor}` (or `Removed in v1.0 with no replacement. See …`).
  - Python: `DeprecationWarning: {old} is removed in composio 1.0. Use {replacement}. See {GUIDE_URL}#{anchor}` — emitted once per process per symbol via the module-level guard pattern from `connected_accounts.py:34,603-612`.
  - `GUIDE_URL` is resolved once at execution against the real docs routing — the docs source mounts at `/docs` (`docs/lib/source.ts`), so the shape is `https://docs.composio.dev/docs/upgrading-to-v1` unless a vanity redirect is added; either way, one constant per SDK (a shared string in one module), never hand-typed per warning, and U5's link check asserts it resolves.
- **KTD4 — Skill shape.** `.agents/skills/v1-migration/SKILL.md` with the standard frontmatter, plus `references/rename-table.md` generated from the ledger (single source: a small script or manual sync step noted in the skill). The `.claude/skills` symlink follows the repo convention.
- **KTD5 — Docs versioning.** The docs site is Fumadocs; the selector implementation follows Fumadocs' versioning approach (separate version trees or tabs). The exact mechanism is *(settle-at-execution)* after checking the current `docs/` setup — the requirement is user-visible v0/v1 switching, not a specific mechanism.

### Sequencing

U1 (warning sweep) blocks U7 (release prep). U2–U5 (tooling) are parallel to U1 and to each other. U6 (docs) needs the ledger and the warning template anchors. The release ships only when the migration guide URL in the warnings resolves — guide before release.

## Implementation Units

### U1. Warning sweep per the ledger

- **Goal:** R1, R2, R3.
- **Files:** every file the ledger's `rename-bridge`/`remove-at-1.0`/`server-retired` rows point at, in both SDKs; TS error plumbing from plan 004 U5 and Python from U6 ride along if not already merged.
- **Approach:** Mechanical application of KTD3. For TS, verify each `@deprecated` surfaces in editors (JSDoc on the exported symbol, not an inner overload). For Python, one warning guard per symbol.
- **Test scenarios:** Python — `pytest.warns(DeprecationWarning)` per swept symbol, exactly-once-per-process semantics; TS — a lint/grep check that every ledger row's symbol carries `@deprecated` with a `docs.composio.dev/upgrading-to-v1` URL; no ledger row missing, no extra deprecations beyond the ledger (two-way diff test against the ledger table).
- **Verification:** `pnpm typecheck && pnpm test`; `cd python && make chk && make tst`.

### U2. TypeScript codemod package

- **Goal:** R4 per KTD1.
- **Files:** `ts/packages/codemod/**` (new), root workspace registration, changeset.
- **Approach:** jscodeshift with fixture-pair tests (input/output files per transform). The `initiate-flagger` inserts a `// TODO(composio-v1): migrate to link()` comment above call sites. The `error-code-comparisons` transform must not blindly rewrite `TS-SDK::` literals — on the final 0.x, `err.code` still carries the old prefix, so a literal swap breaks working handlers. Instead it rewrites comparison *expressions* (`err.code === 'TS-SDK::X'`, `switch` cases, `includes` checks where recognizable) into `ComposioError.matchesCode(err, 'COMPOSIO::X')`, which is correct on both the final 0.x and every 1.x. Literals it cannot prove are comparisons get a flag comment instead of a rewrite.
- **Test scenarios:** fixture pairs per transform including no-op files (idempotence: running twice yields the same output); `v1` composite runs all transforms; a fixture project using every old API compiles against 1.0 after codemod + manual `initiate` fix; scoped-path invocation only touches given paths.
- **Verification:** package tests via `pnpm test` (workspace); `pnpm check:package-exports` includes the new package.

### U3. Python migration script

- **Goal:** R5 per KTD2.
- **Files:** `python/scripts/codemod_v1.py` (new), `python/tests/test_codemod_v1.py` (fixture-based), guide section.
- **Test scenarios:** fixture pairs for each rename family; idempotence; files with no matches untouched (byte-identical); syntax-error input fails loudly rather than corrupting.
- **Verification:** `cd python && make tst` (or the focused pytest file if the Makefile scopes).

### U4. v1-migration agent skill

- **Goal:** R6 per KTD4.
- **Files:** `.agents/skills/v1-migration/SKILL.md`, `.agents/skills/v1-migration/references/rename-table.md` (canonical tree only — `.claude/skills` is a symlinked view per `AGENTS.md` and is never edited separately).
- **Test scenarios:** `pnpm validate:agent-skills && pnpm validate:skill-routing` green; the rename table matches the ledger (diff check documented in the skill's maintenance note).
- **Verification:** validators plus a dry-run of the skill against a scratch project using old APIs.

### U5. "Upgrading to 1.0" docs pages

- **Goal:** R7 (pages half).
- **Files:** `docs/content/**` — one page per language, anchored per rename family so KTD3 URLs resolve; navigation entries.
- **Test scenarios:** every anchor referenced by a swept warning message exists (scripted link extraction from source → docs anchor check); `bun run lint:links` green.
- **Verification:** `cd docs && bun run types:check && bun run lint && bun run lint:links && bun run test`.

### U6. Docs version selector

- **Goal:** R7 (selector half) per KTD5.
- **Files:** `docs/` Fumadocs config + content-tree restructuring as the chosen mechanism requires.
- **Approach:** Investigate Fumadocs' current versioning support in the repo's docs setup first; pick the lightest mechanism that serves v0 pages to v0 users. This unit carries the most unknowns — timebox the investigation and record the chosen mechanism in the PR.
- **Test scenarios:** v0 and v1 variants of one SDK page render and cross-link; default version is v1 after the cut, v0 before it (config toggle).
- **Verification:** docs gates as U5.

### U7. Final 0.x release prep

- **Goal:** R8. **Dependencies:** U1–U6 (guide URL must resolve).
- **Files:** changesets (TS), `python/pyproject.toml` version + `python/CHANGELOG.md`.
- **Approach:** Release notes lead with the warning-only framing and link the guide. Hand off for tagging/publish per repo release flows (Changesets on `next`; `py@<version>` tag).
- **Verification:** `pnpm check:package-exports`; release-guide checklist (`ts/docs/internal/release.md`); human sign-off.

## Verification Contract

| Gate | Command | Applies to |
| --- | --- | --- |
| TS | `pnpm typecheck && pnpm test && pnpm build:packages && pnpm check:package-exports` | U1, U2, U7 |
| Parity | `pnpm validate:sdk-parity` | U1 |
| Python | `cd python && make chk && make tst && make build` | U1, U3, U7 |
| Skills | `pnpm validate:agent-skills && pnpm validate:skill-routing` | U4 |
| Docs | `cd docs && bun run types:check && bun run lint && bun run lint:links && bun run test` | U5, U6 |

## Definition of Done

- Two-way diff between the ledger and the shipped warnings is empty (every non-keep row warns; nothing warns that the ledger does not name).
- `npx @composio/codemod v1` migrates a fixture project to compile against the planned 1.0 surface, modulo documented manual steps; the Python script does the same for its families.
- Skill validators green; docs pages live with resolving anchors; version selector functional.
- Final 0.x releases prepared and handed off — not published — with warning-only release notes.

## Risks & Dependencies

- The migration-guide URLs are baked into shipped warning strings; publishing docs after the npm/PyPI release would 404 every warning — docs deploy is a release precondition, stated in U7's checklist.
- The version selector (U6) is the highest-variance unit; if Fumadocs versioning fights the current setup, a "v0 archive" static export is the acceptable fallback — decide inside the timebox, don't let it gate U7 beyond the selector requirement.
- `server-retired` rows: the managed-OAuth endpoint hard-retired 2026-07-03 (today) — the warning for `initiate()` already exists; U1 only verifies its message matches KTD3.
