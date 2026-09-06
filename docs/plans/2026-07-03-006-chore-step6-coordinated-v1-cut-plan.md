---
title: Step 6 — Coordinated 1.0 Cut - Plan
type: chore
date: 2026-07-03
origin: road-to-v1.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Step 6 — Coordinated 1.0 Cut - Plan

## Goal Capsule

- **Objective:** Execute the cut: remove the deprecated surface per the ledger, install the 1.x rename bridges, flip the error prefix, bump floors and pins, and prepare the coordinated `@composio/core@1.0.0` (Changesets) and `composio==1.0.0` (PyPI tag) releases.
- **Authority:** the deprecation ledger (`docs/decisions/sdk-v1-deprecation-ledger.md`) is executed verbatim; `docs/decisions/sdk-1.0-stability-contract.md` defines what the release may and may not contain.
- **Stop conditions:** tagging and publishing require explicit human authorization — prepare everything, hand off the trigger. Any red gate in the readiness checklist stops the cut. All three gating lanes (async Python, plumbing, polish) must be green first.
- **Depends on:** plans 001–005 complete; lanes 007 (async) and 009 (plumbing/polish) green; lane 008 (hooks) explicitly non-gating.

---

## Product Contract

### Summary

The cut is mostly deletion and bookkeeping, made safe by everything before it: users were warned (Step 5), bridges exist for renames, and the parity guardrail plus freeze tests hold the target still. The one policy nuance: renamed APIs keep deprecated alias bridges through 1.x; removed-no-replacement APIs are deleted now; `initiate()` for managed OAuth is a server-driven retirement removed without a bridge (the backend cut it off on 2026-07-03 regardless of SDK version).

### Requirements

Surface execution:

- R1. Every `remove-at-1.0` ledger row is deleted from both SDKs; every `rename-bridge` row keeps a working deprecated alias; every `wire-mirror-keep` row is untouched; the `server-retired` row (`initiate()` managed-OAuth path) is removed with docs/examples already pointing at `link()`.
- R2. The TS error `code` flips to `COMPOSIO::` (plan 004 KTD4 step 2); `matchesCode` keeps accepting `TS-SDK::` through 1.x.
- R3. `@composio/core/generated` is absent from the published exports map (plan 003 U3), satisfying the `check-package-exports.mjs` major-version guard.

Version plumbing:

- R4. TS provider peers bump their floor to `>=1.0.0 <2.0.0` in the same release train as core 1.0.0 (they ship as majors alongside core so the peer range and the release stay consistent); `ts/scripts/check-peer-deps.ts` green.
- R5. Python providers bump to `composio>=1.0,<2`; all 12 `pyproject.toml`/`setup.py` pairs move together.
- R6. `ts/scripts/validate-sdk-parity.mjs` reflects the end state: stable client pins (from plan 001), gemini provider matrix (from plan 004), and zero pending allowances.

Release:

- R7. A readiness checklist (below) is fully green before handoff; `@composio/core` 1.0.0 goes through Changesets on `next`, `composio` 1.0.0 through the `py@1.0.0` tag flow; providers ride the same trains.
- R8. Release announcements state the coordinated promise (one contract, declared parity, independent version integers) and link the migration guide; `@composio/google` gets its npm deprecation message pointing at `@composio/gemini`.

### Scope Boundaries

- No new features enter this cut; anything not already merged rides 1.1.
- MCP stays experimental; its graduation is a later 1.x minor by design.
- Publishing/tagging is human-triggered; this plan ends at verified readiness plus prepared release PRs.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — One removal PR per SDK, ledger-ordered.** Reviewability over granularity: a single TS removal PR and a single Python removal PR, each structured commit-per-ledger-bucket, so the diff maps 1:1 onto the ledger and nothing extra slips in. The two-way ledger-diff test from plan 005 U1 inverts here: after removal, no `remove-at-1.0` symbol remains, all bridges still exist.
- **KTD2 — Bridges are tested as bridges.** Every alias gets a test asserting (a) it delegates to the new name and (b) it is marked deprecated. These tests are deleted at 2.0 with the bridges.
- **KTD3 — Readiness checklist is a committed artifact**, `docs/decisions/sdk-v1-cut-checklist.md`, checked into the release PR and mirrored in its description. It is the roadmap's "done when" made mechanical (table below).
- **KTD4 — Version choreography.** TS: one changeset marking `@composio/core` major plus majors for all providers (peer-floor bumps are breaking for providers); merged to `next`, released by the existing automation. Python: `bump.py` to `1.0.0`, `python/CHANGELOG.md` entry, `py@1.0.0` tag after npm side confirms (TS is the reference; if one side must go first, TS goes first, and the announcement waits for both).

### Readiness checklist (KTD3 content)

| # | Gate | Proof |
| --- | --- | --- |
| 1 | Stable clients pinned | `validate:sdk-parity` pins check green with >= 1.0 clients |
| 2 | Parity: names frozen | validator green, zero pending allowances |
| 3 | Freeze tests | session-config freeze type-tests green both SDKs |
| 4 | Ledger executed | two-way ledger diff empty (removals gone, bridges present) |
| 5 | Error contract | catalog check green; TS prefix flipped; Python codes present |
| 6 | Async Python | `AsyncComposio` shipped or dated deferral decision recorded |
| 7 | Peers/pins | `check:peer-deps` green at 1.0.0; Python providers `>=1.0,<2` |
| 8 | Exports | `check:package-exports` green (incl. no `./generated`, publint, attw) |
| 9 | Migration live | docs guide + selector deployed; codemod published; skill validators green |
| 10 | Full suites | TS + Python + docs + examples gates all green |
| 11 | Release notes | changesets + changelog + announcement drafted, both link the guide |

## Implementation Units

### U1. TypeScript removal + bridge PR

- **Goal:** R1, R2 for TS.
- **Files:** per ledger — `provider/OpenAIProvider.ts` (Assistants helpers out), `errors/ComposioError.ts` (`exitProcess`/`exitCode` out; prefix flip), deprecated MCP/auth-config schemas per ledger, bridge tests (new), all touched suites.
- **Test scenarios:** ledger two-way diff (KTD1); bridge delegation + deprecation tests (KTD2); `matchesCode('TS-SDK::…')` still matches its `COMPOSIO::` twin; freeze tests unchanged.
- **Verification:** `pnpm typecheck && pnpm test && pnpm build:packages && pnpm validate:sdk-parity && pnpm check:package-exports`.

### U2. Python removal + bridge PR

- **Goal:** R1 for Python (`initiate()` managed-OAuth removal per the server-retired rule, alias bridges from plan 004 kept, ledger removals executed).
- **Files:** `python/composio/core/models/connected_accounts.py`, `exceptions.py` (retired-endpoint error retained while the non-managed `initiate` path, if any, remains — follow the ledger row exactly), bridge tests.
- **Test scenarios:** ledger two-way diff; managed-OAuth `initiate()` gone and docs/examples grep-clean of it; aliases warn-and-delegate.
- **Verification:** `cd python && make chk && make type_inference && make tst && make build`.

### U3. Floors, pins, and validator end-state

- **Goal:** R4, R5, R6.
- **Files:** 10× `ts/packages/providers/*/package.json` peers, 12× `python/providers/*/pyproject.toml` + `setup.py`, `ts/scripts/check-peer-deps.ts` (extended — see below), `ts/scripts/validate-sdk-parity.mjs`, lockfiles via package managers.
- **Approach:** `check-peer-deps.ts` today only asserts the current core version *satisfies* each provider range — a stale `>=0.10.0 <2.0.0` range would silently pass core 1.0.0, so the script cannot enforce the floor bump. Extend it: when core's major is >= 1, require each provider's declared floor to be >= 1.0.0 (policy-encoded, so the check is self-maintaining at 2.0 too).
- **Test scenarios:** extended `check:peer-deps` fails on a provider left at the old floor (scratch verification) and passes after the bump; validator green; a scratch install of `composio-openai` against `composio==0.17.x` fails resolution (Python floor works).
- **Verification:** `pnpm check:peer-deps && pnpm validate:sdk-parity`; `cd python && make build`.

### U4. Release train prep + checklist

- **Goal:** R3, R7, R8 per KTD3/KTD4.
- **Files:** changesets, `python/CHANGELOG.md`, `docs/decisions/sdk-v1-cut-checklist.md` (new), announcement draft (wherever product changelog lives per plan 009's changelog story), npm deprecation message text for `@composio/google` (applied at publish time by the release operator).
- **Test scenarios:** checklist rows each cite a green run URL or command output; dry-run `pnpm changeset version` on a scratch branch produces the expected 1.0.0 graph.
- **Verification:** human review of the checklist; explicit authorization gate for tag/publish.

## Verification Contract

Full battery, all green, recorded in the checklist: `pnpm typecheck && pnpm test && pnpm build:packages && pnpm validate:sdk-parity && pnpm check:package-exports && pnpm check:peer-deps && pnpm validate:agent-skills && pnpm validate:skill-routing`; `cd python && make chk && make type_inference && make tst && make build`; `cd docs && bun run types:check && bun run lint && bun run lint:links && bun run test`.

## Definition of Done

- Roadmap Step 6 done-when holds: both SDKs tagged 1.0 (by the authorized operator), Python ships sync and async, parity check and conformance tests green, migration guide live.
- The checklist artifact is fully green and archived in the release PRs.
- No abandoned experiments in the release diffs; every change traces to a ledger row, a floor bump, or release bookkeeping.
