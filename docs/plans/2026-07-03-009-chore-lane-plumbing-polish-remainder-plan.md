---
title: Lane — Release Plumbing and Polish Remainder - Plan
type: chore
date: 2026-07-03
origin: road-to-v1.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Lane — Release Plumbing and Polish Remainder - Plan

## Goal Capsule

- **Objective:** Close what is left of the "release plumbing" and "polish" lanes after this branch already landed most of them, so the lanes are green before the cut (plan 006).
- **Authority:** `docs/decisions/sdk-v1-readiness.md` §Should-settle; the branch-state audit below is the baseline — do not redo done work.
- **Stop conditions:** none structural; all work is in this checkout and low-risk.

---

## Product Contract

### Summary

The branch audit found the plumbing lane essentially done: peer ranges widened (B1), Python provider pins (B7), version-drift fix (B8), publint/attw wired via `check-package-exports` (in `ts/scripts/changeset-release.sh:16` and `ts.release.yml`), provider typecheck scripts, Python examples CI, the type-inference test un-skipped, the Zod matrix documented, the release guide fixed, and the MCP barrel narrowed. Five remainders survive, plus one item each parked from other plans.

### Requirements

- R1. Python `mcp.delete` returns a concrete type instead of `t.Dict[str, t.Any]` (`python/composio/core/models/mcp.py:414`) — the last untyped return the polish lane named.
- R2. Every TS provider has runtime tests covering `wrapTools` output shape and execute-callback wiring. Spot checks show several already do (e.g. `ts/packages/providers/google/test/google.test.ts`, `vercel/test/vercel.test.ts` cover both) — so this is a gap inventory plus fill, not a blanket build-out; providers with adequate coverage are closed with evidence.
- R3. One changelog story is settled and written down: per-package Changesets changelogs (TS) + hand-maintained `python/CHANGELOG.md` (Python) + a release-guide step that cross-posts user-facing changes to the product changelog. Recorded in `ts/docs/internal/release.md` and the Python release skill/guide; no new tooling.
- R4. Python packaging metadata consolidates: `setup.py`/`pyproject.toml` duplication reduced to one source where feasible and a `[build-system]` table present, per the readiness should-settle item — verify current state first (the metadata-alignment commit may have partially done this).
- R5. One parked follow-up: re-check that provider `typecheck` scripts run in CI, not just exist. (The skill validators are already wired — `ts.test.yml:57` and `py.check.yaml:62` run all three validators; plan 002 records the evidence.)

### Scope Boundaries

- Everything the audit marked DONE is out of scope; if execution discovers regressions there, that is a bug report, not silent scope growth.
- Floor bumps to `>=1.0` are plan 006 U3, not here.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Provider tests are contract tests, not framework simulations (R2).** Each thin provider test asserts: `wrapTools` maps a fixture Composio tool into the framework's expected shape (keys, name normalization, schema passthrough), and the execute path round-trips arguments to a stubbed `execute`. No network, no real framework runtime beyond its type surface. One shared fixture module to keep the nine suites uniform.
- **KTD2 — Changelog story (R3) settles on "three surfaces, one checklist":** Changesets stays authoritative for npm packages; `python/CHANGELOG.md` stays authoritative for PyPI; the product changelog gets a manual cross-post step in the release checklist for user-visible changes. Rationale: automation across three heterogeneous surfaces is not worth the plumbing before 1.0; a checklist step is auditable and cheap.
- **KTD3 — R1 return type:** if the generated client declares a delete response model, use it via the wrapper; otherwise declare a minimal `McpDeleteResponse` TypedDict in the SDK (precedent: locally re-declared `ConfigToolkit`).

## Implementation Units

### U1. Type `mcp.delete` (Python)

- **Goal:** R1 per KTD3.
- **Files:** `python/composio/core/models/mcp.py`, `python/tests/` MCP suite.
- **Test scenarios:** delete returns the typed model on the mocked payload; mypy clean; docstring reflects the type.
- **Verification:** `cd python && make chk && make type_inference && make tst`.

### U2. Provider test-coverage inventory + gap fill (TS)

- **Goal:** R2 per KTD1.
- **Files:** inventory across `ts/packages/providers/*/test/**` first; then only the providers whose suites miss `wrapTools`-shape or execute-wiring coverage gain tests (shared fixture helper per existing conventions).
- **Approach:** Produce the inventory as a table in the PR (provider → covered scenarios → verdict); fill only real gaps. Add one shared scenario everywhere it is missing: a tool with a `oneOf`-bearing schema survives wrapping (guards the plan 001 client swap at the provider layer).
- **Test scenarios per gap provider:** `wrapTools` shape mapping; execute round-trip via stub; empty tool list; the `oneOf` schema case.
- **Verification:** `pnpm test` (workspace-wide) and per-provider `pnpm --filter <pkg> test`.

### U3. Changelog story + release-guide update

- **Goal:** R3 per KTD2.
- **Files:** `ts/docs/internal/release.md`, Python release guidance (wherever `python-release` skill sources live in `.agents/skills/`), possibly `docs/decisions/README.md` if recorded as a mini-decision.
- **Test scenarios:** none (docs); `pnpm validate:agent-skills` if a skill file changes.
- **Verification:** review; skill validators.

### U4. Python packaging consolidation

- **Goal:** R4.
- **Files:** `python/pyproject.toml`, `python/setup.py`, `python/scripts/bump.py` if the consolidation changes what it rewrites.
- **Approach:** Verify-then-do: if `[build-system]` already exists and `setup.py` is already minimal, close as done with evidence. Keep the parity validator's pin-agreement check (it reads both files) working — if `setup.py` goes away entirely, update `checkGeneratedClientPins` in the same PR.
- **Test scenarios:** `make build` produces sdist+wheel with identical metadata; `pnpm validate:sdk-parity` green after any pin-site change.
- **Verification:** `cd python && make build`; `pnpm validate:sdk-parity`.

### U5. CI wiring verification sweep

- **Goal:** R5.
- **Files:** `.github/workflows/*.yml` (read-mostly; small additions only if gaps found).
- **Test scenarios:** provider typecheck runs on provider-touching PRs; every gate this lane's plans cite actually exists in a workflow.
- **Verification:** green CI on a touch-all-paths scratch PR, or workflow-file review with run links.

## Verification Contract

| Gate | Command |
| --- | --- |
| Python | `cd python && make chk && make type_inference && make tst && make build` |
| TS | `pnpm typecheck && pnpm test` |
| Parity | `pnpm validate:sdk-parity` |
| Skills | `pnpm validate:agent-skills && pnpm validate:skill-routing` |

## Definition of Done

- No bare `t.Dict` returns remain on the Python public surface (grep-verified).
- All nine thin providers have passing runtime tests wired into CI.
- The changelog story is written where release operators will read it; packaging consolidation verified or completed with the validator kept green.
- Plan 006's checklist can cite this lane as green with run links.
