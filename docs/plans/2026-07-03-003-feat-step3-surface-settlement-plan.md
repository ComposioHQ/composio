---
title: Step 3 — Stable vs Experimental Surface Settlement - Plan
type: feat
date: 2026-07-03
origin: road-to-v1.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Step 3 — Stable vs Experimental Surface Settlement - Plan

## Goal Capsule

- **Objective:** Label every public surface stable or experimental with no third state: graduate Tool Router to stable, keep MCP correctly experimental (and fix its self-contradictions), settle the fate of `@composio/core/generated`, and produce the deprecation ledger that Steps 4–6 execute against.
- **Authority:** `docs/decisions/sdk-1.0-stability-contract.md` (tiers, Tool Router graduation, MCP stays experimental); `road-to-v1.md` Step 3. The stable/experimental split is settled — do not re-litigate it; this plan implements it.
- **Stop conditions:** the Tool Router type lock (U1) should land together with or after plan 010's session-create options, or the lock freezes a surface we already know is incomplete — sequence U1 after plan 010 U1/U2. If the `./generated` decision (U3) surfaces a CLI-breaking constraint that contradicts the recommendation, stop and surface it rather than shipping either option.
- **Depends on:** Step 1 (plan 001) for client-typed surfaces; plan 010 for the session-create option set.

---

## Product Contract

### Summary

Four settlements: (1) Tool Router loses its experimental label and its session types get locked with a type-level freeze test; (2) MCP keeps the experimental label but stops contradicting itself (mount-path docstrings, the phantom `wrapMcpServers` hook reference); (3) the published `./generated` subpath — currently a throwing Proxy stub that `check-package-exports.mjs` already refuses to allow at major >= 1 — is unpublished from the exports map, with the CLI codegen redirected to user-project output; (4) all 36 `@deprecated` markers in `ts/packages/core/src` (plus Python's deprecation surface) are classified into a committed deprecation ledger with one of four verdicts each.

### Problem Frame

You cannot freeze names (Step 4) on surfaces still in flux, and you cannot write the final 0.x warning release (Step 5) without knowing exactly what 1.0 removes, renames, or keeps. Today the flagship feature carries a "may break" label, MCP's own docstrings contradict its mount, a published subpath throws on access, and the deprecation set exists only as scattered markers.

### Requirements

Tool Router graduation:

- R1. All experimental markers on the sessions surface (`composio.sessions`, `create`/`use`/`delete`, `ToolRouterSession` methods, and their Python twins) are removed; docs and JSDoc/docstrings state the surface is stable.
- R2. The locked session-create config is the plan-010-extended shape (including `search`, `execute`, `manageConnections.connectionRemoval`, and the `raw` escape hatch), and a type-level freeze test pins its key set in both SDKs so accidental key removals/renames fail CI.
- R3. The deprecated `composio.toolRouter` / `composio.tool_router` aliases stay deprecated (bridge through 1.x per the migration ADR) — graduation does not un-deprecate them.

MCP consistency:

- R4. MCP remains experimental at 1.0 and is labeled so consistently: the `composio.mcp` mount, `ts/packages/core/src/models/MCP.ts`, `python/composio/core/models/mcp.py`, and the session-MCP docs all carry the same experimental + deprecated-in-favor-of-session-MCP story, with docstrings that match the actual mount path.
- R5. The nonexistent `wrapMcpServers` hook named in a deprecation message is corrected to the real replacement (`wrapMcpServerResponse` compatibility hook or session MCP guidance).

Generated subpath:

- R6. The `./generated` decision is executed on the staged schedule: this step changes the CLI default and adds the warning; the final 0.x (plan 005) ships the warning to users; the 1.0 cut (plan 006 R3) removes `./generated` from the `exports` map, satisfying the `check-package-exports.mjs` guard that hard-fails it at major >= 1. `composio ts generate` emits into the user's project by default and the documented import path moves off the package subpath.

Deprecation ledger:

- R7. A committed ledger (`docs/decisions/sdk-v1-deprecation-ledger.md`) lists every deprecated API in both SDKs with exactly one verdict: `wire-mirror-keep` (mirrors live payloads; stays), `rename-bridge` (alias through 1.x, removed 2.0), `remove-at-1.0` (no replacement; warned in 0.x), or `server-retired` (only `connected_accounts.initiate()` for managed OAuth). Steps 5 and 6 execute this ledger verbatim.

### Scope Boundaries

- Executing the ledger (adding warnings, removing APIs) is Steps 5–6 (plans 005, 006).
- The naming audit and error catalog are Step 4 (plan 004).
- MCP's eventual graduation shape is out of scope; only its labeling honesty is in scope.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Unpublish `./generated`, redirect codegen output (R6).** Recommendation over the "document and pin" alternative. Rationale: the subpath's only shipped value is a Proxy that throws instructions; freezing a throwing stub as a 1.0 contract also freezes the shape `composio ts generate` writes, which couples CLI codegen evolution to core's semver. Unpublishing costs one CLI change (emit into e.g. `./composio.generated/` in the user project, import from a relative path) and one migration-ledger entry; documenting costs a permanent contract on an opt-in mechanism. The `check-package-exports.mjs` guard was written to force exactly this decision — resolve it in the cheap direction. Alternative kept visible: if telemetry shows meaningful `@composio/core/generated` import adoption, flip to "document and pin the generated shape" and add a conformance test for the codegen output instead.
- **KTD2 — Type-lock via type-tests, not runtime snapshots (R2).** Add `ts/packages/core/type-tests/session-config-freeze.test-d.ts` asserting the exact key union of `ToolRouterCreateSessionConfig` *and of each nested config object it locks* (`manageConnections` object variant, `search`/`execute` configs, sandbox/preload shapes) plus the session method signatures; a Python equivalent asserts `inspect.signature(ToolRouter.create)` parameter names *and* the `__annotations__` of the nested config TypedDicts/dataclasses. A top-level-only lock would miss removal of a nested key like `manageConnections.connectionRemoval`. Cheap, reviewable, and fails on both addition-without-declaration and removal.
- **KTD3 — The ledger is a decision record, not a plan.** It lives in `docs/decisions/` because it is the durable answer to "what does 1.0 remove"; plans 005/006 cite it. Every row: symbol, language, file:line, verdict, replacement (if any), migration note.
- **KTD4 — Experimental labeling convention:** TypeScript marks experimental surfaces with a `@experimental` JSDoc tag plus the `experimental.*` namespace where applicable; Python uses a `.. warning:: Experimental` docstring block. MCP is the one stable-mounted-but-experimental surface (it cannot move under `experimental.*` without a pointless double-break given it graduates in 1.x); the contract ADR already accepts this, the labels just have to say it.

### Deprecation ledger seed (initial classification)

The audit found 36 TS markers across 15 files. Directional classification the ledger must finalize:

| Bucket | Members (evidence) |
| --- | --- |
| `wire-mirror-keep` | `types/connectedAccounts.types.ts:197-232` (`data`/`params`/`authScheme` → `state`), `types/webhookEvents.types.ts` (6 markers), `types/authConfigs.types.ts:113,152,163`, `types/tool.types.ts:374`, `models/Tools.ts:937,1277` (`customConnectionData` param) |
| `rename-bridge` | `composio.toolRouter` → `sessions` (`composio.ts:226`; Py `sdk.py:225-237`), `workbench` → `sandbox` (`models/ToolRouterSession.ts:171`, `types/toolRouter.types.ts:733`, `lib/toolRouterParams.ts:145,203`), `experimental.updateAcl` → `connectedAccounts.updateAcl` (`models/Experimental.ts:194`), `composio.mcp` → session MCP (`composio.ts:210`, `models/MCP.ts:48`, `provider/BaseProvider.ts:65`, `types/mcp.types.ts:9,21,33`) — bridge kept while MCP is experimental |
| `remove-at-1.0` | OpenAI Assistants helpers (`provider/OpenAIProvider.ts:273,355,481`), `ErrorHandleOptions.exitProcess`/`exitCode` (`errors/ComposioError.ts:22,24,295`), `tools.getRawComposioTools` deprecated overload (`models/Tools.ts:443` — verify replacement guidance first), `./experimental` subpath if still published |
| `server-retired` | `connected_accounts.initiate()` managed-OAuth path, both SDKs (backend hard-retired 2026-07-03; Py `connected_accounts.py:478-612`, TS `models/ConnectedAccounts.ts` + `ConnectedAccountsErrors.ts`) |

## Implementation Units

### U1. Tool Router graduation + type lock

- **Goal:** R1, R2, R3.
- **Dependencies:** plan 010 U1–U2 (option set complete), plan 001 (client-typed session types stable).
- **Files:** `ts/packages/core/src/models/ToolRouter.ts`, `models/Sessions.ts`, `models/ToolRouterSession.ts`, `types/toolRouter.types.ts`, `ts/packages/core/type-tests/session-config-freeze.test-d.ts` (new), `python/composio/core/models/tool_router.py`, `tool_router_session.py`, `python/tests/test_session_config_freeze.py` (new), docs pages describing Tool Router as experimental.
- **Approach:** Sweep experimental wording; add the freeze tests (KTD2). Directional freeze-test sketch:

  ```ts
  // type-tests/session-config-freeze.test-d.ts — fails when a locked key moves
  type LockedKeys = 'sessionPreset' | 'mcp' | 'tools' | 'tags' | 'toolkits'
    | 'authConfigs' | 'connectedAccounts' | 'manageConnections' | 'sandbox'
    | 'workbench' | 'multiAccount' | 'preload' | 'experimental'
    | 'search' | 'execute' | 'raw';
  expectType<TypeEqual<keyof ToolRouterCreateSessionConfig, LockedKeys>>(true);
  ```

- **Test scenarios:** freeze tests fail on key add/remove/rename (verify by scratch mutation); existing session suites unchanged; parity validator still green (sessions scope has no allowances today — keep it that way).
- **Verification:** `pnpm typecheck && pnpm test`; `cd python && make chk && make tst`.

### U2. MCP contradiction sweep

- **Goal:** R4, R5.
- **Files:** `ts/packages/core/src/models/MCP.ts`, `provider/BaseProvider.ts:65`, `types/mcp.types.ts`, `python/composio/core/models/mcp.py`, related docs pages.
- **Approach:** Grep-driven: every docstring naming a mount path is checked against the actual mount; the `wrapMcpServers` mention is corrected; experimental labels applied per KTD4. No behavior change.
- **Test scenarios:** docs lint/link gates; a grep for `wrapMcpServers` returns zero hits outside changelogs.
- **Verification:** `pnpm typecheck && pnpm test`; `cd docs && bun run lint:links`.

### U3. Unpublish `./generated`, redirect CLI codegen

- **Goal:** R6 per KTD1.
- **Files:** `ts/packages/cli/src/commands/ts/commands/ts.generate.cmd.ts` and `ts/packages/cli/src/effects/find-composio-core-generated.ts` (default output moves off `node_modules`), CLI docs, ledger row in `docs/decisions/sdk-v1-deprecation-ledger.md`, changeset. The exports-map removal itself (`ts/packages/core/package.json`, stub deletion) is prepared here as a ready diff but ships at the 1.0 cut (plan 006 R3), per the staged R6 schedule.
- **Approach:** Correct the current behavior first: today, when `--output-dir` is omitted, `composio ts generate` locates `@composio/core/generated` under `node_modules` and writes *into the installed package*, shadowing the stub. Change the default to a user-project path (e.g. `./composio.generated/`), keep `--output-dir` for custom locations, print the exact import line users should adopt, and emit a deprecation warning whenever the legacy `node_modules` target is used (0.x behavior). The migration guide documents the import change.
- **Test scenarios:** CLI e2e covering `composio ts generate` (see `ts/e2e-tests/cli`) for the new default path, custom `--output-dir`, and the legacy-target warning; `pnpm check:package-exports` green now, and green at a simulated 1.0.0 once the prepared exports removal is applied (verify on a scratch branch); a project importing the old subpath after removal gets a resolution error whose message is documented in the migration guide.
- **Verification:** `pnpm check:package-exports`, CLI e2e suite for the generate command.

### U4. Write the deprecation ledger

- **Goal:** R7.
- **Dependencies:** U2 (MCP verdicts), U3 (subpath verdict). The ledger lands in two passes to break the apparent Step 3 ↔ Step 4 cycle: pass one (this unit) classifies everything except rename rows, which carry `TBD(plan-004)` placeholders; pass two lands in the same PR as plan 004's verdict-table merge and drains every placeholder. Plan 004 depends on U1–U3 of this plan, not on the finalized ledger; plan 005's entry gate is the *finalized* ledger (pass two complete).
- **Files:** `docs/decisions/sdk-v1-deprecation-ledger.md` (new), `docs/decisions/README.md` (index entry).
- **Approach:** Start from the seed table above; add the Python side (its deprecation surface is smaller: `tool_router` property, `initiate()`, plus whatever plan 004 renames introduce). Every row names the 0.x warning mechanism (TS `@deprecated` / Py `DeprecationWarning`) and the 1.0/2.0 fate.
- **Test scenarios:** ledger cross-checked against a fresh `grep -rn "@deprecated" ts/packages/core/src` and `grep -rn "DeprecationWarning" python/composio` — zero unclassified markers.
- **Verification:** `cd docs && bun run lint:links`; review sign-off that buckets match the migration ADR's rules.

## Verification Contract

| Gate | Command | Applies to |
| --- | --- | --- |
| TS | `pnpm typecheck && pnpm test && pnpm build:packages` | U1–U3 |
| TS exports | `pnpm check:package-exports` | U3 |
| Parity | `pnpm validate:sdk-parity` | U1 |
| Python | `cd python && make chk && make type_inference && make tst` | U1, U2 |
| Docs | `cd docs && bun run lint:links` | U2, U4 |
| CLI e2e | Docker CLI suite under `ts/e2e-tests/cli` (generate command) | U3 |

## Definition of Done

- Every public surface carries exactly one label; grep finds no experimental wording on sessions surfaces and no stable claims on MCP.
- Freeze tests exist in both SDKs and demonstrably fail on a scratch key mutation.
- The CLI default no longer writes into `node_modules`, the legacy target warns, and the exports-map removal is a prepared, scratch-verified diff scheduled for the 1.0 cut (`check-package-exports` green at a simulated 1.0.0 with it applied).
- The deprecation ledger exists, indexes cleanly, and classifies 100% of deprecation markers in both SDKs; `TBD(plan-004)` rename placeholders are permitted until plan 004's verdicts merge, and must be zero before plan 005 starts (its entry gate).
