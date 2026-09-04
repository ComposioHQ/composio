---
title: Client Passthrough Policy and Granular Session Flags - Plan
type: feat
date: 2026-07-03
origin: road-to-v1.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Client Passthrough Policy and Granular Session Flags - Plan

## Goal Capsule

- **Objective:** Close the reported gap — no granular way to disable Tool Router meta tools above the `direct_tools` preset — and fix the class of problem behind it: generated-client capabilities (`@composio/client` / `composio-client`) that the high-level SDK silently narrows away. Ship first-class granular session flags, a typed `raw` passthrough on session create, and a decision record making "no silent narrowing" the v1 policy.
- **Authority:** new decision record (U4) amends `docs/decisions/generated-client-codegen.md` §Wrap-the-surface without weakening it: wrapping stays; *silent* narrowing ends.
- **Stop conditions:** the first-class flags (U1, U2) are additive 0.x work and can ship immediately; the `raw` option's public *type* stays experimental until `@composio/client`/`composio-client` graduate (plan 001), then stabilizes with plan 003's type lock.
- **Feeds:** plan 003 U1 locks the session-create config — this plan's fields must exist first.

---

## Product Contract

### Summary

A user reported: "Was looking into disabling meta tools in a Tool Router session… I found `SESSION_PRESET_DIRECT_TOOLS`, but that disables meta tools as a bundle. The API/generated client does support granular flags like `execute.enable_multi_execute=false` — why isn't this exposed?" The investigation confirmed it precisely: both SDKs hard-code `search: { enable: false }` and `execute: { enable_multi_execute: false }` only inside the `direct_tools` branch (`ts/packages/core/src/models/ToolRouter.ts:250-253`; `python/composio/core/models/tool_router.py:1030-1032`), the high-level create options have no `search`/`execute` keys at all, and `manage_connections.enable_connection_removal` plus experimental `permissions`/`link_url_overwrite` are likewise dropped. The only workaround is the raw client (`composio.getClient()` / `composio.client`). This plan exposes the granular flags first-class, adds a `raw` deep-merge escape hatch so the *next* backend capability is reachable without an SDK release, and writes the policy down.

### Requirements

First-class flags (both SDKs):

- R1. Session create accepts `search` — TS `boolean | { enable?: boolean }`, Py `bool | ToolRouterSearchConfig` — mapping to wire `search.enable`. Bare `false` means `{ enable: false }`.
- R2. Session create accepts `execute` — TS `{ multiExecute?: boolean }`, Py `ToolRouterExecuteConfig` with `multi_execute` — mapping to wire `execute.enable_multi_execute`.
- R3. `manageConnections`/`manage_connections` config gains `connectionRemoval`/`connection_removal` mapping to wire `enable_connection_removal` (completing a partial mapping: `waitForConnections` already maps `enable_wait_for_connections`).
- R4. Preset interaction is defined: `session_preset="direct_tools"` applies its defaults (including `search.enable=false`, `execute.enable_multi_execute=false`); explicit user values override preset defaults, key by key. `create(sessionPreset: 'direct_tools', search: true)` yields `search.enable: true` on the wire.

Raw passthrough:

- R5. Session create accepts `raw`: a wire-shaped (snake_case) object deep-merged into the generated request body last, winning over SDK-mapped values on conflict — except protected keys (R6). TS type: `SessionCreateParamsOverride = DeepPartial<SessionCreateParams>` (a deep-partial, since merge semantics are recursive and nested generated types carry their own required fields); Py: a structurally-typed `Mapping` documented against `session_create_params.SessionCreateParams`. Marked experimental until the client pins are stable (plan 001), then stable.
- R6. `raw` never bypasses SDK invariants: (a) a protected-key set — initially exactly `user_id` — is stripped from `raw` with a runtime warning; (b) SDK-side invariant validations (e.g. the top-level `preload` custom-slug rejection at `ts/packages/core/src/models/ToolRouter.ts:98-101`) run against the *merged* payload, not the pre-merge config, so `raw` cannot smuggle past them; (c) the SDK logs (debug level) every SDK-mapped key that `raw` overrides, so surprising interactions are diagnosable.

Policy:

- R7. A decision record (`docs/decisions/generated-client-passthrough.md`) states the v1 rule: the SDK wraps the generated surface (unchanged), but when a wrapper narrows a generated params/response type, the narrowing must be *declared* — either a first-class mapped option, a `raw` passthrough reachable equivalent, or a documented exclusion with a reason. New generated-client capabilities get one of the three within one minor release.
- R8. A coverage check makes R7 mechanical for the session-create surface at minimum: a test that diffs the generated `SessionCreateParams` keys against (first-class mapped keys ∪ an explicit exclusion list with per-entry reasons). `raw` is deliberately *not* a bucket — since `raw` reaches every key by construction, counting it would make the check vacuous. A new generated key therefore always fails the check until a human either maps it first-class or adds an exclusion entry (whose reason may be "raw-only for now, first-class pending X"), which is exactly the forced verdict R7 wants.
- R9. An inventory pass applies R7 to the other narrowed surfaces found in the audit — the generated `experimental.permissions` and `experimental.link_url_overwrite` at minimum — each getting a verdict (map, raw-only, or excluded).

### Scope Boundaries

- `raw` ships on session create only in this plan; extending it to other create/update wrappers follows the R7 policy surface-by-surface, on demand — not a blanket sweep now.
- No changes to `tools.execute` or MCP surfaces here.
- The raw-client escape hatch (`getClient()`/`.client`) remains available and documented as the full-fidelity fallback; this plan does not deprecate it.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Naming: drop the `enable_` prefix, keep the noun.** High-level options use the established convention from `manageConnections` (`waitForConnections` ↔ wire `enable_wait_for_connections`): TS camelCase nouns (`multiExecute`, `connectionRemoval`), Python snake_case (`multi_execute`, `connection_removal`); wire names appear only in the transform layer. `search` follows the `manageConnections` precedent of `boolean | config-object` union for the common toggle case.
- **KTD2 — `raw` is the name of the escape hatch.** Precedent: "raw" already means wire-shaped in this SDK (`getRawComposioTools`, `dont_strip_raw` idioms). Rejected: `clientParams` (implies transport options — collides with `requestOptions`), `unstable_` prefix (the option is permanent; its *type* matures), `passthrough` (vague). Inside `raw`, keys are wire-shaped snake_case in both languages — it is the generated client's vocabulary by definition, and that is the point.
- **KTD3 — Merge semantics: deep-merge, raw wins, applied last, then invariants.** Rationale: an escape hatch that loses to SDK defaults cannot fix an SDK gap, which is its purpose. Objects merge recursively; arrays and scalars replace; protected keys (R6a) are stripped with a warning before merging; SDK invariant validations run *after* the merge (R6b). The R6 debug log names each overridden path. Directional TS pipeline:

  ```ts
  // ToolRouter.ts create() — order matters: assemble → strip → merge → validate → send
  const sanitizedRaw = stripProtectedRawKeys(routerConfig.raw);   // e.g. user_id, warned
  const payload = deepMergeRawParams(
    basePayload,     // SDK-mapped fields incl. preset defaults + explicit flags
    sanitizedRaw     // wire-shaped, wins key-by-key, logged on override
  );
  assertSessionPayloadInvariants(payload);  // e.g. preload custom-slug rejection, post-merge
  ```

- **KTD4 — Preset becomes defaults-provider, not owner (R4).** The `direct_tools` branch moves from "spread hard-coded values into the payload" to "seed defaults that explicit options override": preset defaults → explicit typed options → `raw`, in ascending precedence. This keeps `SESSION_PRESET_DIRECT_TOOLS` semantics for existing users (no explicit flags → identical wire payload) while making the preset composable.
- **KTD5 — Coverage check placement (R8).** TS type-level: `keyof SessionCreateParams` minus (mapped ∪ excluded) must be `never` (a type-test in `ts/packages/core/type-tests/`), so the check runs on every client bump — exactly when a new capability appears. Python mirrors with a runtime test introspecting the generated TypedDict's `__annotations__`. The exclusion list lives next to the tests, every entry carrying a reason string; it is reviewed like the parity allowances, and `raw` reachability never counts as coverage (R8).
- **KTD6 — Zod schema shape (TS).** New schema fields on `ToolRouterCreateSessionConfigBaseSchema`:

  ```ts
  search: z.union([z.boolean(), z.object({ enable: z.boolean().optional() })]).optional(),
  execute: z.object({ multiExecute: z.boolean().optional() }).optional(),
  // inside manageConnections object variant:
  connectionRemoval: z.boolean().optional(),
  raw: SessionCreateParamsOverrideSchema.optional(),  // z.custom<DeepPartial<SessionCreateParams>> until client is stable
  ```

  Python mirrors with keyword args `search: t.Optional[t.Union[bool, ToolRouterSearchConfig]]`, `execute: t.Optional[ToolRouterExecuteConfig]`, `raw: t.Optional[SessionCreateParamsRaw]` on `ToolRouter.create` (both overload sets), plus `connection_removal` on `ToolRouterManageConnectionsConfig`.

### Target user experience (settles the reported case)

```ts
// TS: keep meta tools, disable only multi-execute
await composio.sessions.create(userId, {
  toolkits: ['github'],
  execute: { multiExecute: false },
});

// TS: future backend flag the SDK hasn't mapped yet
await composio.sessions.create(userId, {
  toolkits: ['github'],
  raw: { execute: { enable_multi_execute: false }, permissions: { ... } },
});
```

```python
# Python: direct-tools preset but with search kept on
composio.sessions.create(
    user_id=user_id,
    session_preset=SESSION_PRESET_DIRECT_TOOLS,
    search=True,
)
```

## Implementation Units

### U1. TypeScript flags + raw + preset refactor

- **Goal:** R1–R6 (TS half) per KTD1–KTD4, KTD6.
- **Files:** `ts/packages/core/src/types/toolRouter.types.ts` (schema + exported config types incl. `SessionCreateParamsOverride`), `src/models/ToolRouter.ts` (payload pipeline: strip → merge → validate per KTD3, moving the existing preload invariant check post-merge), `src/lib/toolRouterParams.ts` (transforms for search/execute/connectionRemoval), a small `src/utils/deepMergeRawParams.ts` with protected-key stripping and override logging, tests.
- **Test scenarios:** each flag maps to its wire name; bare `search: false` ≡ `{ enable: false }`; preset alone produces today's exact wire payload (regression fixture); preset + explicit override (R4 example); `raw` deep-merges and wins over both preset and explicit flags with a debug log per overridden path; `raw` with arrays replaces, not concatenates; `raw` containing `user_id` is stripped with a warning (R6a); `raw` injecting a custom/local slug into `preload` is still rejected by the post-merge invariant check (R6b); unknown-key handling of the config schema is unchanged from today outside `raw` (regression, not a new strictness claim); `connectionRemoval` reaches `manage_connections.enable_connection_removal`.
- **Verification:** `pnpm typecheck && pnpm test`.

### U2. Python flags + raw + preset refactor

- **Goal:** R1–R6 (Python half).
- **Dependencies:** U1 (contract fixed by TS reference).
- **Files:** `python/composio/core/models/tool_router.py` (`create` overloads + `_apply_session_preset_defaults` refactor per KTD4 + merge helper), config types (`ToolRouterSearchConfig`, `ToolRouterExecuteConfig`, `connection_removal` on `ToolRouterManageConnectionsConfig`), `python/tests/test_tool_router.py`.
- **Test scenarios:** mirror U1's list in pytest, including the preset-regression fixture asserting byte-identical `create_params` for preset-only calls; `raw` typed against `session_create_params.SessionCreateParams` keys (mypy-checked).
- **Verification:** `cd python && make chk && make type_inference && make tst`.

### U3. Coverage check (both SDKs)

- **Goal:** R8 per KTD5.
- **Dependencies:** U1, U2.
- **Files:** `ts/packages/core/type-tests/session-params-coverage.test-d.ts` (new), `python/tests/test_session_params_coverage.py` (new), exclusion lists co-located with reasons.
- **Test scenarios:** current generated keys all accounted for; a simulated new key (scratch augmentation) fails the check; exclusion entries require a reason string (lint-by-shape in the test).
- **Verification:** `pnpm typecheck`; `cd python && make tst`.

### U4. Decision record + narrowed-surface inventory

- **Goal:** R7, R9.
- **Files:** `docs/decisions/generated-client-passthrough.md` (new; Decision / Problem / Scope / the three-outcome rule / relation to the codegen ADR / FAQ including "why raw wins on merge"), `docs/decisions/README.md` index, verdict rows for `experimental.permissions` and `experimental.link_url_overwrite` (recommendation: raw-reachable now, first-class mapping when the features leave backend experimental), user-docs snippet on session page documenting `search`/`execute`/`raw` and the raw-client fallback.
- **Test scenarios:** `cd docs && bun run lint:links`; ADR cross-links to plan 003 (type lock) and plan 001 (type graduation) resolve.
- **Verification:** docs gates; review that the ADR does not contradict `generated-client-codegen.md` §Wrap (it must cite and extend it).

## Verification Contract

| Gate | Command | Applies to |
| --- | --- | --- |
| TS | `pnpm typecheck && pnpm test` | U1, U3 |
| Python | `cd python && make chk && make type_inference && make tst` | U2, U3 |
| Parity | `pnpm validate:sdk-parity` | U1, U2 (no method changes; options parity is manual — note in ADR) |
| Docs | `cd docs && bun run lint:links` | U4 |

## Definition of Done

- The reported use case works first-class in both SDKs: disabling `multi_execute` (or search) without the bundle preset, verified by the exact scenario from the report as a test.
- Preset-only calls produce byte-identical wire payloads to today (no behavior change for existing users).
- `raw` ships experimental-typed with deep-merge-wins semantics and override logging; the coverage check fails on the next unmapped generated key; the ADR is indexed and cross-linked.
- Plan 003's freeze test can lock the final key set (`search`, `execute`, `raw` included) immediately after this plan lands.

## Risks & Dependencies

- `raw` typed from client types deepens the client-type leak until plan 001 graduates the client — accepted consciously: the leak already exists on this surface (`SessionCreateResponse`-derived types), and the experimental marker on `raw`'s type bounds the promise. Cross-referenced in plan 001 U9/U10.
- Deep-merge precedence bugs are the main correctness risk; the preset-regression fixtures and per-key override tests are the guard.
- Backend semantics: confirm with the backend team that `search.enable=false` with `execute.enable_multi_execute=true` (and other partial combinations) are valid server-side states before documenting them — the flags exist on the wire type, but the plan should not document combinations the backend rejects. *(settle-at-execution)*
