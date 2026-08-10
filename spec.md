# Spec — Examples Live Parity

Make every example script in this monorepo runnable unattended against the
real Composio production backend (a dedicated, disposable project), locally and on CI, under BOTH the Stainless
clients (baseline) and the new self-managed clients from
`~/work/composio/composio-client` (candidate), with no observable behavioral
difference. The API key used must belong to a project holding no valuable
connections or data.

## Vocabulary

- **Entrypoint** — one runnable script: a `ts/examples/<pkg>/src/**/*.ts` file
  or a `python/examples/**/*.py` file. Library files (`logger.ts`, `types.ts`,
  worker modules) are not entrypoints.
- **Baseline client** — `@composio/client@0.1.0-alpha.76` (npm) /
  `composio-client==1.43.0` (PyPI), the Stainless builds pinned today.
- **Candidate client** — the packed tarball / wheel built from
  `~/work/composio/composio-client` (never modified by this goal; artifacts
  are provided via `COMPOSIO_CLIENT_TARBALL` / `COMPOSIO_CLIENT_WHEEL`).
- **Sweep** — one full run of the manifest under one client.

## Tiers

Every entrypoint carries exactly one tier in `examples-manifest.json`:

| Tier | Meaning | Green criterion |
|---|---|---|
| `1` | Unattended: hackernews / read-only / no external account | exit 0 within timeout |
| `2` | Unattended given pre-provisioned state (connected accounts, auth configs, env-injected IDs) on the dedicated disposable production project | exit 0 within timeout |
| `3` | Bounded: interactive or long-running (OAuth redirect flows, listeners, servers). Runner waits for the `readiness` regex on stdout/stderr, then terminates the process and counts it green | readiness matched within timeout |
| `X` | Excluded from scoring (stdin REPL, public-tunnel webhook, worker modules). Capped; see constraints | never run |

Tier moves are monotone toward MORE coverage: `X→3→2→1` allowed, the reverse
requires editing `eval/baseline-tiers.json`, which is read-only. New
entrypoints added to the repo enter the manifest at their honest tier.

## The example contract

Every tier 1/2/3 entrypoint must:

1. **Fail loudly.** A failure anywhere must produce a non-zero exit code. No
   `try/catch` that only logs (TS), no `except Exception: print(e)` (Python).
   Rethrow, `process.exitCode = 1`, or `raise`.
2. **Read state from env, not literals.** No placeholder literals
   (`<auth_config_id>`), no hardcoded account/user IDs. Required IDs come from
   `COMPOSIO_EXAMPLES_*` env vars (see Provisioning) with a loud error when
   missing.
3. **Not override the backend.** `COMPOSIO_BASE_URL` is injected by the
   runner; examples must not hardcode base URLs or construct clients pointing
   elsewhere.
4. **Terminate.** Tier 1/2 must exit on their own; tier 3 must print a
   readiness line (already true for OAuth flows printing a redirect URL and
   servers logging their port; add one where missing).
5. **Stay a teaching artifact.** These are user-facing examples: fixes must
   keep them idiomatic and readable, not turn them into test harnesses.
6. **Never send email.** The harness shims refuse email-send tool executions
   at the transport (default denylist `GMAIL_SEND|GMAIL_REPLY|SEND_EMAIL|
   SEND_DRAFT|OUTLOOK[A-Z_]*SEND`) and a run that trips the guard is red
   regardless of exit code. Read-only Gmail usage (fetch/list/triggers) is
   fine. Send-by-design examples (`ts/file-handling/*`) are tier X
   (`outbound-email`).

## Manifest schema (`examples-manifest.json`, repo root, agent-editable)

```jsonc
{
  "entries": [{
    "id": "ts/openai/index",            // lang/pkg/relative-entry (no ext)
    "lang": "ts" | "py",
    "pkg": "openai-example",            // pnpm filter name (ts only)
    "file": "ts/examples/openai/src/index.ts", // repo-relative
    "tier": "1" | "2" | "3" | "X",
    "reason": "stdin-repl",             // required for X
    "env": ["OPENAI_API_KEY"],          // beyond COMPOSIO_API_KEY
    "ids": ["COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID"], // provisioned IDs
    "toolkits": ["hackernews"],
    "backend": true,                    // hits Composio API (negative-control eligible)
    "serial": false,                    // mutates shared org state → no concurrency
    "readiness": "https?://.*redirect", // tier 3 only: regex
    "timeoutSec": 120,
    "pyWith": ["crewai"]                // extra uv --with deps (py only)
  }]
}
```

## Runner (`harness/run.mjs`, read-only instrument)

- `node harness/run.mjs sweep --client baseline|candidate [--lang ts|py] [--ids a,b]`
  runs manifest entries with bounded concurrency (default 4, `serial` entries
  sequentially at the end), per-entry timeout, and writes
  `.artifacts/examples-parity/<run-id>/results.jsonl`:
  `{id, tier, exit, status: green|red|skipped, durationMs, traceFile, reason?}`.
- TS entries run as `pnpm --filter <pkg> exec tsx <src-relative-file>` with
  `NODE_OPTIONS=--import <abs>/harness/trace/register.mjs`.
- Python entries run as `uv run --project python [--with dep]... python <file>`
  with `PYTHONPATH=<abs>/harness/trace-py` prepended (sitecustomize hook).
- Injected env per entry: `COMPOSIO_API_KEY`, `COMPOSIO_BASE_URL`
  (production by default, refused if localhost/127.0.0.1), LLM keys, provisioned
  `COMPOSIO_EXAMPLES_*` IDs, `COMPOSIO_TRACE_FILE` (unique per entry run).
- `node harness/run.mjs neg --ids ...` reruns entries with garbage
  `COMPOSIO_API_KEY`/LLM keys; expectation: non-zero exit AND (tier 3) no
  readiness match. An entry that stays green under garbage credentials is a
  swallower.
- `node harness/run.mjs selftest` — no credentials needed: runs the
  known-good fixture (error-handling-demo), the known-bad fixture
  (`harness/fixtures/always-fails.{ts,py}`), and a trace-shim check (a
  scripted 401 against the backend must appear in the trace file). All three must
  behave as labeled.

## Trace capture and parity

- Shims wrap `globalThis.fetch` (TS) and `httpx.Client.send` /
  `httpx.AsyncClient.send` (Python). For requests whose host matches the
  Composio backend they append `{"m": method, "p": path, "s": status}` to
  `COMPOSIO_TRACE_FILE` (JSONL). For LLM hosts (openai/anthropic/google) they
  append only `{"llm": host}` — call counting for spend tracking, no bodies.
- **Normalization**: path → template by replacing UUIDs, `ca_*`, `ac_*`,
  `ti_*`, `sess_*`-shaped segments and numeric segments with `{id}`; strip
  query strings; status → class (`2xx`…). Secrets never land in traces.
- **Parity rule (per entrypoint)**: let `B` and `C` be the SETS of distinct
  `(method, path-template)` pairs from the baseline and candidate sweeps.
  Parity holds iff `B == C`, ignoring pairs listed in
  `parity-variance.json` (root, agent-editable, HARD CAP 10 entries, each
  `{pair, justification}`). All recorded statuses in a green run must be
  2xx/3xx.

## Client swap (candidate sweeps)

- TS: `harness/run.mjs` applies a `pnpm-workspace.yaml` override pointing
  `@composio/client` at `COMPOSIO_CLIENT_TARBALL`, runs `pnpm install`,
  **verifies the resolved version changed** (vacuous-pass guard, same trick as
  composio-client's release-acceptance), rebuilds `ts/packages`, sweeps, then
  restores the tree (`git checkout -- pnpm-workspace.yaml pnpm-lock.yaml` +
  reinstall).
- Python (Stage B only): override `composio-client` to
  `COMPOSIO_CLIENT_WHEEL` via `uv run --with <wheel>` after the SDK migration
  to the 2.0.0 surface has landed on this branch.

## Provisioning (`scripts/examples-provision.mjs`, deliverable, agent-authored)

Idempotent script against the dedicated disposable production project: ensures auth configs
and connected accounts for the toolkits tier-2 entries need (gmail,
googledrive, github, notion, slack, weathermap), creates missing API-key-auth
connections automatically, prints exactly which OAuth connections still need a
one-time human browser authorization, and emits `COMPOSIO_EXAMPLES_*`
exports. Never prints secrets.

## CI (deliverable, agent-authored)

`.github/workflows/examples-live.yml`: `workflow_dispatch` (inputs: lang,
client, ids) + nightly cron; production URL + a dedicated disposable examples-project key secret (never the org's main key); uploads
results/trace artifacts; never a required PR check. It invokes the same
runner (`harness/run.mjs sweep`), so local and CI runs are the same code
path. The existing `ts.examples-nightly.yml` stays untouched until this
workflow is stable, then the human decides on consolidation.

## Stages

- **Stage 0 (inner loop)**: `node harness/run.mjs selftest` green.
- **A1**: all tier-1 entries green under baseline (fix swallowing,
  placeholders, missing readiness lines; adjust manifest honestly).
- **A2**: provisioning script + tier-2/3 green under baseline.
- **A3**: TS candidate sweep green + trace parity.
- **A4**: `examples-live.yml` green from GitHub Actions (dispatch), both
  clients, non-blocking.
- **B**: migrate `python/composio/client/` (and the 41 bypass import sites)
  from Stainless 1.43.0 to the 2.0.0 surface per
  `~/work/composio/composio-client/python/MIGRATION.md`, keeping
  `python/tests` green; then Python candidate sweep green + trace parity.

## Non-goals

Staging or local/mock backends (the target is production with a disposable project); sending email (or any outbound messaging) from example runs;
modifying `~/work/composio/composio-client`; publishing packages; making the
CI job a required check; byte-level response diffing (already covered by
composio-client's live-parity harness).
