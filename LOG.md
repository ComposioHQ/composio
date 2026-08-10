# Iteration Log — examples live parity (Stainless → self-managed clients)

Started: 2026-08-10 · Budgets: 24 h loop / ≤ 2 500 LLM calls / production (disposable project) only

<!-- One entry per cycle. Hypothesis, expected failure mode, and diagnostic are
     written BEFORE the change — a hypothesis written after the result is a
     rationalization. -->

## Cycle 1 — 2026-08-10 (operator-babysat first scored run)
- Score (dev): pending · Probe: pending
- Hypothesis: first `score.sh` on production with the disposable key will
  VOID on the negative-control gate — the inventory flagged ~10 scaffold-template
  examples (versioning, session-management, json-schema-to-zod, llamaindex,
  google, triggers/index, anthropic/index, tools/index, py langchain_agent)
  whose try/catch-and-log wrappers exit 0 even when broken, so they stay green
  under garbage credentials. Tier-1 baseline green should otherwise land
  around 25–35 of 68 TS entries (OPENAI/ANTHROPIC keys present, GEMINI absent)
  and 5–7 of 23 Python.
- Expected failure mode: the sweep hangs on a tier-3 entry whose readiness
  regex never matches, or `uv --with` installs (crewai) blow the timeout —
  both would show as timeout reds, not VOID.
- Diagnostic: `run.mjs neg` summary names swallowers (legit fix targets, not
  memorization); sweep results.jsonl separates `timedOut` from exit-code reds.
- Change: none this cycle — pure measurement to establish the honest baseline.
- Result: **VOID on the negative-control gate, as hypothesized** — 17
  swallowers stayed green under garbage credentials (predicted list confirmed
  plus: mastra/openai hackernews-agent pairs, openai/chat-completions,
  triggers/subscribe, py fastapi_app, both py experimental_tool_router
  scripts; prediction was 10, actual 17). Baseline sweep before the VOID:
  23 green / 49 red / 19 skipped.
  - 49 reds are dominated by ONE environment fact, not by example bugs: the
    OpenAI key in `.envrc` (`OPEN_API_KEY`) is dead — 401 from
    `GET https://api.openai.com/v1/models` directly. Every OpenAI-dependent
    entry failed with `invalid_api_key`; Anthropic-dependent and no-LLM
    entries ran fine (both smoke scripts green on production).
  - 19 skips = missing `COMPOSIO_EXAMPLES_*` provisioned IDs (expected pre-A2)
    plus GEMINI_API_KEY / NOTION_API_KEY absent locally.
  - `ts/triggers/index` timed out: subscribes without printing anything the
    readiness regex can match — needs a readiness line (contract rule 4).
  - `py/auth_configs` fails for real against production (dummy OAuth client
    IDs rejected) — needs env-driven values (contract rule 2).
- Reflection: instruments, not memorization, did the work — a third of the
  "green" entries are fake-green swallowers, which is exactly why C alone
  would have been a lying metric. Cycle 2 priorities: (1) BLOCKED on human:
  a valid OPENAI_API_KEY; (2) fix the 17 swallowers (fail-loudly
  conversions); (3) add the missing readiness line to ts/triggers/index.

## Cycle 2 — 2026-08-10 (operator-driven: fail-loudly conversions)
- Score (dev): prev VOID · Probe: 17 swallowers named in cycle 1
- Hypothesis: converting the 17 swallowers to fail-loudly (rethrow /
  process.exitCode = 1 / raise instead of catch-and-log; plus a readiness
  line for ts/triggers/index and a real __main__ server for py/fastapi_app)
  clears the negative-control VOID and yields the first numeric score.
  Predicted ≈ 10–14 (dead OpenAI key keeps most LLM entries red; the fixes
  legitimately flip several fake-greens to red).
- Expected failure mode: a conversion accidentally changes example semantics
  (e.g. exits before the teaching flow completes) or misses a nested catch,
  leaving a residual swallower.
- Diagnostic: targeted `run.mjs neg --ids <the 17>` must go all-red; then a
  full `score.sh` must print a number, not VOID.
- Change: fail-loudly conversions in 13 files (commit 2dfa5dd6b); dropped 4
  module-only pseudo-entries and fixed readiness regexes that matched stack
  traces (commit 3c8e62e3d).
- Result: hypothesis confirmed — **SCORE 11.1, first numeric cycle, zero
  VOID** (ts 9/64 green, py 7/23 green, parity 0 pending candidate
  artifacts). Sweep: 16 green / 52 red / 19 skipped. All negative controls
  red; trace liveness clean.
- Reflection: generalizing — the instruments removed fake coverage rather
  than added it (23 "green" in cycle 1 were worth 16 honest ones). The
  score is now blocked on inputs only the human can provide: a valid
  OPENAI_API_KEY (~30 entries), provisioned COMPOSIO_EXAMPLES_* IDs +
  connected accounts (19 skips), GEMINI/NOTION keys (3 entries), and
  candidate artifacts (COMPOSIO_CLIENT_TARBALL) to open the parity half.

## Final report
- Best holdout score:
- Stage state (0/A1/A2/A3/A4/B):
- Divergences found (feed back to composio-client):
- What was abandoned (and why):
- Highest-leverage next steps:

## Cycle 3 — 2026-08-10 (valid OpenAI key; gemini/notion dropped)
- Score (dev): prev 11.1 · Probe: NC all red, liveness clean (cycle 2)
- Hypothesis: with a working OPENAI_API_KEY (verified 200 on /v1/models) the
  ~invalid_api_key reds flip; gemini/notion entries leave the denominators
  (ts 64→62, py 23→22, X=9 `dropped-provider`). Predicted score 18–26
  (ts green 9→~22-27, py 7→~9-11). Non-LLM reds from cycle 2 (anthropic/
  streaming, toolkits/*, triggers/trigger-types, tools/tool-conversion,
  tool-router/toolkits) are NOT explained by the key and should persist —
  they are cycle 4's real investigation targets.
- Expected failure mode: sweep wall-clock grows (real LLM calls now run
  to completion); some agentic entries burn >150 LLM calls or hit timeouts.
- Diagnostic: status.sh LLM call count for the sweep; timedOut flags in
  results.jsonl.
- Change: manifest/baseline re-freeze only (this entry precedes the run).
- Result:
- Reflection:

## Cycle 4 — 2026-08-10 (ESM fix for top-level await)
- Score (dev): prev 15.6 · Probe: NC all red, liveness clean
- Hypothesis: 18 example packages lacked "type": "module" (only the two
  nightly-blessed ones had it), so tsx transpiled to CJS and every top-level-
  await entrypoint died at transform time — that's most of the surviving TS
  red cluster. Adding the field flips them. Spot-verified 4/4 green.
  Predicted score 24–30 (ts green 19→~32; py unchanged, its cluster is an
  openai-agents/pydantic version drift — cycle 5 target).
- Expected failure mode: an example that implicitly relied on CJS semantics
  breaks; or wrangler/cf tooling objects to the field.
- Diagnostic: per-entry outputTail; ts.examples.yml cf:dry-run in CI later.
- Change: "type": "module" in 18 example package.jsons (commit 29acb2137).
- Result: hypothesis confirmed — **SCORE 24.9** (ts 42/62 green, py 7/22).
  Remaining reds cluster cleanly: anthropic trio (not_found_error — model
  id rot), py openai-agents family (pydantic InputTokensDetails drift),
  tools/* (gdrive account not provisioned yet), cloudflare-wrangler dev
  (.dev.vars plumbing), py/auth_configs (dummy OAuth ids), plus 4 singles.
- Reflection: generalizing — two systemic fixes (fail-loudly, ESM) moved
  the score 11.1 → 24.9 without touching the metric surface.

## Cycle 5 — 2026-08-10 (anthropic model rot + py dependency drift)
- Score (dev): prev 24.9 · Probe: NC red, liveness clean
- Hypothesis: (a) the anthropic trio fails on retired model IDs
  (claude-3-7-sonnet-latest / claude-3-5-sonnet-latest retired 2026-02-19;
  claude-4-sonnet-20250514 malformed+deprecated) — replacing with
  claude-sonnet-5 per the migration guide's retired-model table flips
  ts/anthropic/index + streaming green. (b) the py tool_router family dies
  inside openai-agents (pydantic InputTokensDetails.cache_write_tokens) —
  a version overlay via manifest pyWith can confirm whether newer
  openai-agents fixes it without touching uv.lock.
- Expected failure mode: (a) examples also depend on retired-model response
  shapes (unlikely — plain messages.create); (b) newer openai-agents has
  incompatible API surface with the example code.
- Diagnostic: targeted sweep of the affected ids before/after.
- Change: model IDs in 4 anthropic example files (commit 8604355d8);
  pyWith "openai-agents>=0.19" on the 6 entries importing `agents`
  (commit 63d0387ce).
- Result: both hypotheses confirmed — **SCORE 30.6** (ts 45/62, py 11/22).
  Trajectory: 11.1 → 15.6 → 24.9 → 30.6. Remaining 12 reds characterized:
  - ts/vercel/stream: Composio 404 on getRawComposioToolBySlug (stale tool
    slug in the example) — doc rot.
  - ts/openai/agents-api-tool-router: OpenAI 400 — MCP `server_label`
    violates `^[A-Za-z][A-Za-z0-9_-]*$` (example builds an invalid label) —
    integration drift vs OpenAI Responses API validation.
  - py/experimental_tool_router_advanced: Composio 400 `payload.toolkits:
    Invalid input` — example payload shape drift vs current API.
  - py/auth_configs: dummy OAuth client ids rejected (contract rule 2 work).
  - ts/tools/index + ai: gdrive account not provisioned (Stage A2).
  - ts/cloudflare-wrangler/dev: env → .dev.vars plumbing (Stage A2).
  - py claude_agent / crewai_agent / langchain_agent / custom_tools_agent_test
    (TIMEOUT): heavyweight deps + gmail provisioning (Stage A2).
  - ts/tool-router/langchain: TBD (output truncated by pnpm noise).
  17 entries still skip on missing COMPOSIO_EXAMPLES_* ids — provisioning is
  now the single biggest lever (~+11 points), then the 4 drift fixes (~+4).
- Reflection: generalizing. Repo-rot findings produced so far: dead OpenAI
  key, missing ESM declarations, retired Claude model ids, openai/openai-agents
  lock skew, stale tool slug, invalid MCP server_label, toolkits payload
  drift. The uv.lock skew and the two API-drift items deserve upstream fixes
  beyond this goal's surface.
