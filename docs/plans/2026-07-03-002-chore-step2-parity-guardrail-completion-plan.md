---
title: Step 2 — Parity Guardrail Completion - Plan
type: chore
date: 2026-07-03
origin: road-to-v1.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Step 2 — Parity Guardrail Completion - Plan

## Goal Capsule

- **Objective:** Close the small remainder of roadmap Step 2. The guardrail itself already landed on this branch (`ts/scripts/validate-sdk-parity.mjs`, commit `0dee49590`, wired into both `.github/workflows/ts.test.yml:59` and `.github/workflows/py.check.yaml:64`); what remains is wiring the sibling validators into CI and writing down the allowance-drain rule the freeze in Step 4 depends on.
- **Authority:** `docs/decisions/cross-sdk-parity-policy.md` (§Planned enforcement). `docs/decisions/sdk-v1-readiness.md` B9 is input analysis, not a decision, and it predates the wiring that has since landed — treat it as historical context.
- **Stop conditions:** none expected; this is low-risk mechanical work in this checkout.

---

## Product Contract

### Summary

`validate:sdk-parity` exists and enforces the four checks the policy planned: root namespaces, per-resource method names (camelCase↔snake_case normalized, with declared allowances and staleness detection), the provider matrix parsed from the parity-policy ADR table, and the generated-client pin pair. This plan finishes the step: the readiness sequencing also called for `validate:agent-skills` and `validate:skill-routing` in CI, and the allowance list needs an explicit lifecycle so Step 4 drains it instead of accreting it.

### Problem Frame

The parity validator's `allowTypeScriptOnly`/`allowPythonOnly` entries are currently descriptive ("pending pre-1.0 name audit") with no rule that says who removes them and when — without that rule, allowances become permanent declared divergence by default, which is not what they are. The sibling skill validators turn out to be wired already; what remains there is evidence and path-trigger coverage, not construction.

### Requirements

- R1. Verify — with run evidence — that `pnpm validate:agent-skills` and `pnpm validate:skill-routing` run in CI (adversarial review found both already wired at `.github/workflows/ts.test.yml:57` and `py.check.yaml:62`); the unit reduces to confirming path-trigger coverage for the skills tree and closing the readiness item with links.
- R2. The parity policy ADR gains an "allowance lifecycle" paragraph: every method-name allowance in `validate-sdk-parity.mjs` is either (a) a temporary gap that Step 4 (plan 004) must drain, or (b) promoted to declared divergence in the parity matrix with a reason. No third state.
- R3. Each allowance entry in `resourceSpecs` carries a comment pointing at its verdict in plan 004 (or the matrix row), so the validator config and the freeze plan cannot drift silently.
- R4. Confirm the staleness mechanism (validator fails when an allowance is no longer needed, `validate-sdk-parity.mjs:247-259`) covers all four allowance kinds; extend if any drain path would not trip it.

### Scope Boundaries

- Actually draining the allowances (renames, Python additions) is Step 4 work — plan 004, not here.
- Extending the validator with an error-catalog check is plan 004 U-work; extending it with a sync/async check is plan 007 work. This plan only leaves the config legible for them.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Wire, don't rebuild.** Both sibling validators already exist as root `package.json` scripts (`package.json:52-53`); wiring is a workflow-step addition with path filters, mirroring how `validate:sdk-parity` was wired into `py.check.yaml` with path triggers on the script itself.
- **KTD2 — The ADR stays the single config surface for declared divergence.** The provider matrix is already parsed from the ADR markdown table; method-level declared divergence stays in the validator config (code review surface) but must cite the matrix/plan — we do not build a second parser.

## Implementation Units

### U1. Verify skill-validator CI wiring and path coverage

- **Goal:** R1.
- **Files:** `.github/workflows/ts.test.yml`, `.github/workflows/py.check.yaml` (read-mostly; edit only if path-trigger gaps are found).
- **Approach:** Both validators are already invoked (`ts.test.yml:57`, `py.check.yaml:62`); confirm the workflows' path triggers actually fire on skills-tree-only changes (`.agents/skills/**`, `.claude/skills/**`) — if a skills-only PR would skip both workflows, add the paths to one trigger list.
- **Test scenarios:** a PR touching only `.agents/skills/**` runs at least one workflow that executes the validators; both scripts pass on the current tree.
- **Verification:** run links recorded; readiness sequencing item closed as done-with-evidence.

### U2. Allowance lifecycle rule + config annotations

- **Goal:** R2, R3, R4.
- **Files:** `docs/decisions/cross-sdk-parity-policy.md` (one new paragraph under §Planned enforcement, retitled to reflect it is now implemented), `ts/scripts/validate-sdk-parity.mjs` (comments only — no behavior change).
- **Approach:** For each allowance, add `// verdict: plan 004 <U-ID>` or `// declared divergence: <matrix row>`. Update the ADR paragraph from future tense ("will fail CI once B9 is implemented") to present tense, since B9 shipped.
- **Test scenarios:** `pnpm validate:sdk-parity` output unchanged (comments only); ADR link-check green (`cd docs && bun run lint:links` if docs gates apply).
- **Verification:** `pnpm validate:sdk-parity` green; diff review confirms zero behavioral change.

## Verification Contract

| Gate | Command |
| --- | --- |
| Parity | `pnpm validate:sdk-parity` |
| Skills | `pnpm validate:agent-skills && pnpm validate:skill-routing` |
| Docs (if ADR edited) | `cd docs && bun run lint:links` |

## Definition of Done

- Skill-validator CI wiring is confirmed with run links (and path-trigger gaps, if any, closed).
- The parity ADR states the allowance lifecycle in present tense; every allowance in `resourceSpecs` cites its drain verdict or divergence row.
- No behavioral change to `validate:sdk-parity` (same pass/fail on the current tree).
