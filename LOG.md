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
