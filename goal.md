# Goal: every Composio example runs green against staging under both the Stainless and the self-managed clients, with no observable behavioral difference

## Stage 0 — Build to spec (inner loop)

Implement `spec.md`. `node harness/run.mjs selftest` must pass (known-good
green, known-bad red, both trace shims live). Do not score against the sweep
until selftest is green. Selftest stays green every cycle thereafter.

## Target (outer loop)

`SCORE = 25·C_ts + 25·P_ts + 25·C_py + 25·P_py`, where per language, against
the FROZEN denominators in `eval/baseline-tiers.json` (ts=70, py=23):

- `C` — entrypoints green under the **baseline** (Stainless) client / denominator.
  Punishes missing coverage: a skipped, red, or manifest-shrunk entry is a zero.
- `P` — entrypoints green under the **candidate** client AND trace-parity vs
  baseline / denominator. Punishes behavioral drift: same-set
  `(method, path-template)` traces, variance allowlist capped at 10.

Bar: **≥ 92.0 on holdout, zero VOID**, which requires Stage B (Python SDK
migration) — the staged milestones are: A1 `C_ts+C_py` covers all tier-1 ·
A2 all tiers · A3 `P_ts ≈ C_ts` · A4 the same sweep green on GitHub Actions
(dispatch) · B `P_py ≈ C_py`.

Score with `harness/score.sh` (dev). A VOID result means a constraint was
violated — find and remove the violation; the harness will not tell you which
it was. Holdout: `harness/score.sh --holdout` — full negative controls,
aggregate-only output, max 1 call per 6 hours. Acceptance is measured on
holdout exclusively, and the final acceptance run must be the CI
(`workflow_dispatch`) path, not a local shell.

## Constraints

- Wall-clock budget: 24 h of loop time across at most 4 days. Check
  `harness/status.sh` every cycle — it shows score history, sweep durations,
  backend/LLM call counts, and holdout usage. Watch gain per cycle; a flat
  gradient at high burn means stop and report.
- Spend ceilings: ≤ 150 LLM calls per sweep, ≤ 2 500 LLM calls total
  (`status.sh` reports the count; OpenAI/Anthropic/Gemini keys are the paid
  surface). One full sweep ≤ 45 min. Staging only — `COMPOSIO_BASE_URL` is
  pinned to `https://staging-backend.composio.dev`; the runner refuses local
  URLs and you never point anything at production.
- Surface — editable:
  `ts/examples/**`, `python/examples/**`, `examples-manifest.json`,
  `parity-variance.json`, `scripts/examples-provision.mjs`,
  `.github/workflows/examples-live.yml`, `LOG.md`, and (Stage B only)
  `python/composio/**`, `python/tests/**`, `python/pyproject.toml`,
  `python/setup.py`, `uv.lock`.
  Everything else is off-limits — in particular `ts/packages/**` (the TS
  client is drop-in by contract; if TS parity fails because of core, that is a
  FINDING to record in LOG.md, not code to change),
  `~/work/composio/composio-client` (candidate artifacts arrive prebuilt via
  `COMPOSIO_CLIENT_TARBALL`/`COMPOSIO_CLIENT_WHEEL`), the audit directory
  (`~/.composio-goal-audit`), and the existing CI workflows.
- Capacity caps: excluded (tier X) entries ≤ 4, frozen reasons only
  (`stdin-repl`, `external-tunnel`, `worker-module`) · `parity-variance.json`
  ≤ 10 entries, each with a real justification · tier moves only toward more
  coverage (X→3→2→1) · no example may branch on which client is installed, on
  `COMPOSIO_TRACE_FILE`, or on CI-detection env vars.
- Examples stay teaching artifacts: fixes keep them idiomatic and readable.
  Fail-loudly conversions replace swallowed errors with propagation, not with
  assertion frameworks.
- `goal.md`, `spec.md`, `harness/`, and `eval/` are read-only. Eval inputs
  (the manifest, the example sources) are public; there are no hidden answers
  to peek at — the enforcement instruments are negative controls, trace
  liveness, and integrity hashes, and tripping any of them VOIDs the cycle.
- Never commit or echo secrets. Deliverable PRs are cherry-picked by the
  human later and never include `goal.md`, `spec.md`, `LOG.md`, `harness/`,
  or `eval/`.

## Cycle protocol

1. Score (dev): `harness/score.sh`.
2. Reflect: run `harness/probe.sh` — negative controls red? traces live?
   variance allowlist still small? If probe findings grow, the next change
   must REMOVE a gaming-shaped artifact (a variance entry, a skip, a
   swallow), never add one.
3. Hypothesize: log hypothesis, expected failure mode, and diagnostic in
   `LOG.md` BEFORE changing code.
4. Change.
5. Log the result.
6. Checkpoint: `git commit -am "cycle <n>: <score>"` on this branch
   (`goal/examples-live-parity`) — every cycle, gain or no gain. Never push
   to `next`; if pushing, push `goal/examples-live-parity:refs/heads/goal/examples-live-parity`
   explicitly.

## Entropy rules

- Stall rule: if the score didn't move last cycle, the next attempt must be a
  structural change (different example family, different tier, provisioning
  instead of code edits) — same-knob-harder is banned.
- Exploration quota: every 5 cycles, spend one cycle on the least-covered
  area (Python tiers, tier-3 readiness, CI workflow) even if the current
  thread still inches up.

## Stop conditions

Bar hit on holdout via CI · any budget exhausted · marginal gain ≈ 0 for 3
consecutive cycles · blocked on a finding outside the surface (e.g. a real
TS-core/client divergence — that is a WIN for the harness, report it).
On stop: write a final report in LOG.md — best score, per-stage state, every
divergence found (these feed composio-client's parity work), what was
abandoned, highest-leverage next steps.
