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

## Cycle 6 — 2026-08-10 (Stage A2: env plumbing + provisioning script)
- Score (dev): prev 30.6 · Probe: NC red, liveness clean (cycle 5)
- Hypothesis: the 16 skipped entries skip only because their declared
  `ids` env vars were absent at sweep time; .envrc now provides all of them
  except COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID. Replacing the placeholder
  literals with the COMPOSIO_EXAMPLES_* env vars (contract rule 2, loud
  error when missing) plus a new scripts/examples-provision.mjs that
  verifies provisioned state and creates the missing API-key auth config
  (weathermap) flips most of the 16 green. Also: ts/tools/index + ai are red
  on `__dirname` (undefined under ESM) and on userId 'default' (gdrive is
  connected for the provisioned user, not 'default') — fixing both flips
  them. Predicted ts green 45→~55-58, py 11→~14-16, score ≈ 40-44
  (parity axis still 0 this cycle; full parity run is next).
- Expected failure modes: (a) an MCP example fails downstream of the env
  swap (server_label rot, model access) — those become characterized reds,
  not skips; (b) creating a weathermap auth config needs fields the API
  rejects; (c) py/connected_accounts readiness "https?://" doesn't match
  because the ConnectionRequest repr hides the URL — mitigated by printing
  redirect_url explicitly (idiomatic teaching flow anyway); (d) py/triggers
  GITHUB_COMMIT_EVENT rewrite: manifest declares the GMAIL connected
  account, so the example moves to GMAIL_NEW_GMAIL_MESSAGE and real
  instance ids instead of "123" literals.
- Diagnostic: `run.mjs sweep --ids <the 16 + tools pair>` after
  provisioning; each formerly-skipped entry must be green or a
  characterized red (no skips left except APIKEY if provisioning fails).
- Change (cycle 6): env plumbing in 15 example files + scripts/examples-provision.mjs
  (weathermap is NO_AUTH now → serpapi is the API-key toolkit; field name is
  generic_api_key, not api_key). First targeted sweep: 0 skips, 7/18 green.
  The 11 reds all characterized as REAL drift, fixed in the same cycle:
  - MCP auth drift (4 entries + py/mcp): generated MCP URLs (both the
    deprecated `composio.mcp.generate` kind and session `mcp.url`) now
    REQUIRE auth headers — bare-URL examples got 401/405/424. Standalone
    URLs accept x-api-key but NOT `Bearer <api key>` (wants a JWT); session
    URLs accept both. Fixes: anthropic pair → sessions.create + mcp:true +
    authorization_token (Anthropic can only send Bearer); openai pair →
    headers: x-api-key on the hosted MCP tool; ts/mcp + py/mcp → x-api-key
    via transport headers; ts/mcp also SSE→StreamableHTTP (SSE GET now 405).
  - triggers user mismatch (ts create+subscribe): backend enforces
    connected-account-owner == user id; 'default' + examples-owned ca_ → 400.
    Both now use COMPOSIO_EXAMPLES_USER_ID.
  - ts/tools/index: auto file upload requires the
    `dangerouslyAllowAutoUploadDownloadFiles: true` client flag; without it
    the raw path string reaches the backend → 400. Flag added (also ai.ts).
  - py/mcp: manifest lacked pyWith deps (langchain-mcp-adapters etc).
  - py/triggers + ts/langchain/openai: timeouts (120/180s) too tight for
    the full teaching flow; bumped to 300s in the manifest.

## Cycle 7 — 2026-08-10 (the four characterized drift fixes from cycle 5)
- Score (dev): prev 30.6 (cycle 6 targeted verify in flight) · Probe: NC red, liveness clean
- Hypothesis, per entry (diagnosed from sweep outputTails + live API probes):
  (a) ts/vercel/stream: HACKERNEWS_GET_FRONTPAGE no longer exists; the live
      toolkit lists HACKERNEWS_GET_TOP_STORIES — swapping the slug flips it.
  (b) ts/openai/agents-api-tool-router: serverLabel 'composio tool router'
      violates OpenAI's ^[A-Za-z][A-Za-z0-9_-]*$ — 'composio-tool-router'
      fixes it (session MCP URL itself confirmed working via probe).
  (c) py/experimental_tool_router_advanced: three distinct rots — toolkits
      {"disabled": [...]} must be {"disable": [...]} (probe-confirmed both
      SDKs use enable/disable on the wire); manage_connections keys are
      enable/callback_url (not enabled/callback_uri — wrong keys silently
      accepted, fixed for honesty); fake auth_configs/connected_accounts ids
      ARE validated by the backend now (probe: 400 for both) → env-driven
      real ids; ToolRouterToolkitsDisabledConfig / infer_scopes_from_tools
      don't exist in the SDK → ToolRouterToolkitsDisableConfig etc.
  (d) py/auth_configs: cycle-5's characterization was WRONG — dummy OAuth
      client ids are accepted; the real failure is
      tool_access_config.tools_for_connected_account_creation: ["github"]
      (a toolkit slug where tool slugs are required) → 404 'Could not
      resolve tool(s): github'. Fix: a real notion tool slug (the config
      being updated is the notion one).
- Expected failure modes: (c) connected_accounts in sessions must belong to
  the session user → user_id must be COMPOSIO_EXAMPLES_USER_ID for those
  functions; (d) notion tool slugs may also have rotated — fetch live.
- Diagnostic: targeted sweep of the 4 ids after the edits.
- Result (cycles 6+7 targeted verification, all 22 touched ids green):
  - A2 entries: 18/18 green (16 formerly-skipped + ts/tools pair).
  - Drift fixes: 4/4 green (vercel/stream, agents-api-tool-router,
    py tool_router advanced, py/auth_configs).
  - Additional real-drift findings fixed en route: py example file named
    mcp.py shadowed the `mcp` PyPI package (renamed mcp_example.py);
    slack MCP without allowedTools exposes 161 tools > OpenAI's 128-tool
    cap; MCP server names are unique per project (Date.now()/time.time()
    suffixes); py readiness prints must flush=True (block-buffered stdout
    swallowed the readiness line → 300s timeouts); auto file upload
    enforces a fileUploadDirs allowlist; GOOGLEDRIVE_UPLOAD_FILE response
    lost its response_data wrapper (data IS the file object now);
    agents-api-tool-router ALSO needed x-api-key headers (session MCP).
- Next: full score.sh run = cycle 8 (baseline + first TS candidate sweep).

## Cycle 8 — 2026-08-10 (first full score with TS candidate: P_ts opens)
- Score (dev): prev 30.6 · Probe: NC red, liveness clean
- Hypothesis: with A2 + drift fixes all verified green in targeted sweeps,
  the full baseline sweep lands around ts 58-60/62 and py 15-17/22
  (C ≈ 23.4+8.0 → ~40-46 before parity). The TS candidate sweep (tarball
  0.0.0) runs for the first time; if the self-managed client is truly
  drop-in, P_ts ≈ C_ts and the score roughly doubles on the ts axis
  (predicted total ≈ 60-68). Any per-entry parity mismatch is treated as a
  candidate-client divergence FINDING (recorded here), not a variance entry.
- Expected failure modes: (a) pnpm override/rebuild of ts/packages against
  the 0.0.0 tarball fails → no candidate run (finding, ts/packages is
  off-surface); (b) candidate green but trace sets differ on some entries
  (real divergence findings); (c) LLM nondeterminism produces spurious
  trace-set diffs on agentic entries (distinguish before recording).
- Diagnostic: score.sh output + harness/parity.mjs per-entry report.
- Interim result: first score.sh attempt VOIDed at the negative-control
  gate — py/fastapi_app boots uvicorn and prints its readiness line even
  under garbage credentials (it was skipped in every earlier cycle, so the
  instrument had never seen it run). The instrument is right: readiness
  green without any authenticated call is fake coverage. Fix: fail-fast
  `auth_configs.get(...)` before `uvicorn.run` — also guarantees a live
  trace (the app otherwise makes no backend call until a request arrives).
  Baseline sweep itself: 78/84 green, 0 skipped. Remaining 6 reds fixed in
  the same pass (except one structural):
  - ts/connected-accounts/api-key: MULTIPLE_CONNECTED_ACCOUNTS on rerun
    (the provisioned serpapi connection already exists) → allowMultiple.
  - ts/tool-router/langchain: OpenAI now enforces ^[^\s<|\\/>]+$ on
    message.name; agent name 'Gmail Assistant' (space) → 'gmail-assistant'.
    Also user_123 → COMPOSIO_EXAMPLES_USER_ID.
  - py claude/crewai/langchain agents: missing overlay deps
    (composio-claude-agent-sdk from PyPI; crewai>=1.15 for crewai.mcp;
    langchain-mcp-adapters) + user_123 → env; langchain_agent's
    swallowing except→print removed (fail-loudly).
  - ts/cloudflare-wrangler/dev: STRUCTURAL FINDING — the worker runs in
    workerd, which neither trace shim can reach, so a readiness-green
    would always be trace-dead (VOID). Green is impossible under the
    read-only harness; stays red (~0.4pt per axis). Needs a harness
    accommodation or an X reason like worker-module WITH a tier-3→X move,
    which the frozen tiers forbid. Reported, not gamed.
- Result (cycle 8, two attempts, both VOID before a score row):
  1. VOID #1: py/fastapi_app negative-control pass (fixed, see above).
  2. VOID #2: the TS candidate swap is HARD-BLOCKED — harness/run.mjs
     applyTsCandidate() refuses when pnpm-workspace.yaml already has an
     `overrides:` block, and the repo now ships one legitimately (security
     pins: qs/protobufjs/minimatch/js-yaml/undici, commit 0c4c5a360 via
     dependabot remediation). The refusal aborts the candidate sweep with
     no results dir → the liveness step ENOENTs → VOID "trace-liveness
     (ts candidate)". pnpm-workspace.yaml and harness/ are both outside my
     surface: BLOCKED, needs the operator's human. Proposed harness fix
     (one line): merge into the existing block instead of refusing —
     replace the append with an insertion under the existing `overrides:`
     key; the restore path (git checkout -- pnpm-workspace.yaml
     pnpm-lock.yaml) already handles cleanup either way. Note the
     trust-on-first-use integrity hashes in the audit dir must be
     refreshed by the human alongside the patch, or lint VOIDs on
     "read-only file modified".
  - Baseline #2 health: 74/84 green, 0 skipped, NC all red, trace
    liveness clean, LLM calls 125/sweep (back under the 150 ceiling after
    the custom_tools_agent_test trim). 9 of 10 reds are a TIMEOUT cluster
    confined to LLM-calling entries (openai ×2, mastra ×2, llamaindex,
    langchain/openai, anthropic/claude-agents-sdk, ts/mcp/index,
    py/crewai_agent) with EMPTY output tails — all of them green in
    run #1 or in targeted sweeps within the same hour. Reads as provider
    rate-limit/stall during the 16:07–16:47Z window (heavy usage all
    day), not code. Re-scoring after a cool-down; if it recurs,
    concurrency or model choice needs revisiting.
  - Best honest baseline observed this cycle (run #1 + the 6 verified
    fixes): 83/84 baseline-green candidates for C when the sweep is not
    rate-starved; only ts/cloudflare-wrangler/dev is structurally red.
- Unblock (human-approved via session prompt): patched harness/run.mjs
  applyTsCandidate() to merge the '@composio/client' override into the
  repo's existing overrides block (guarding against a pre-existing client
  override) instead of refusing; audit-dir integrity baseline refreshed to
  match; lint OK. Validating with a 1-entry candidate sweep, then score
  run #3.
- Result (cycle 8, attempt 3): **SCORE 65.7** (C_ts 59/62, P_ts 42/62,
  C_py 22/22 — full marks — P_py 0 pre-Stage-B). Trajectory:
  11.1 → 15.6 → 24.9 → 30.6 → 65.7. First TS parity verdict:
  **zero real candidate-client divergences.** The 20 parity misses:
  - 15 = harness normalizer bug: shims template `tr_` ids but production
    tool-router sessions are `trs_` → fresh raw ids each run, parity
    impossible for every tool-router entry. NOT a client difference.
  - 2 status flips = transient Cloudflare-HTML 5xx from the LLM gateway
    (mastra/index candidate-red, mastra/tool-router baseline-red) —
    the same entries are green in adjacent runs.
  - 1 = ts/tool-router/multi-account: EXAMPLE rerunnability bug — alias
    'work-gmail' is unique per entity, so the second run (candidate)
    400s. Fixed (suffixed alias).
  - 1 = claude-agents-sdk transient (baseline-red/candidate-green).
  - 1 = cloudflare-wrangler (structural, red/red).
  Also: py candidate sweep DID run (wheel 2.0.0 passes the version gate;
  the 1.43-era SDK then fails on every entry) — burns ~22 runs per score
  for a guaranteed 0. Unsetting COMPOSIO_CLIENT_WHEEL for dev scores
  until Stage B; holdout/acceptance runs keep it.

## Cycle 9 — 2026-08-10 (trs_ shim fix + rerunnability fixes)
- Score (dev): prev 65.7 · Probe: NC all red, liveness clean
- Hypothesis: with the human-approved `trs_` normalizer fix in both shims
  (one-character prefix bug, integrity refreshed, selftest PASS) and the
  multi-account alias fix, the 15 trs-only parity misses + multi-account
  flip green under parity. Predicted P_ts ≈ 57-59/62 → score ≈ 71-73
  (ts-axis nearly saturated; the residual gap is transient LLM-gateway
  flakes + cloudflare-wrangler structural).
- Expected failure mode: LLM-gateway 5xx flakes shift which entries are
  green between the two sweeps → a couple of status-flip parity misses
  regardless of code.
- Diagnostic: parity.mjs classification (trs-only bucket must be empty).
- Wrinkle: cycle-9 attempt 1 VOIDed on lint — the integrity baseline also
  hashes harness/trace-py/__pycache__/sitecustomize.cpython-312.pyc, which
  Python regenerated after the approved source patch. Refreshed that hash
  under the same approval; lint OK; re-scoring.
- Result (cycle 9): **SCORE 74.2** (C_ts 61/62, P_ts 61/62, C_py 22/22,
  P_py 0). Trajectory: 11.1 → 15.6 → 24.9 → 30.6 → 65.7 → 74.2.
  **Stage A3 COMPLETE**: P_ts == C_ts — every runnable TS entry is green
  under the candidate client with identical (method, path-template) trace
  sets. parity-variance.json still EMPTY (0/10 used). The only non-parity
  entry is ts/cloudflare-wrangler/dev (structural red/red). The transient
  LLM-gateway flakes did not recur this run (83/84 baseline green).
  Verdict for composio-client: the TS 0.0.0 artifact is drop-in against
  production across all 62 example entrypoints — no divergences found.
- Stage state: 0 ✓ · A1 ✓ · A2 ✓ · A3 ✓ · A4 open (workflow drafted;
  needs default-branch presence + EXAMPLES_COMPOSIO_API_KEY secret —
  human) · B open (the remaining +25: py SDK 1.43→2.0 migration).

## Cycle 10 — 2026-08-10 (Stage B opened: py SDK dual-client migration — DESIGN)
- Score (dev): prev 74.2 · Probe: NC red, liveness clean, variance 0/10
- Constraint analysis: the bar (≥92) needs C_py AND P_py green in the same
  cycle; baseline py is pinned to Stainless 1.43 by the frozen spec, the
  candidate is the 2.0.0 wheel overlay (uv run --with). Therefore
  python/composio must run correctly under BOTH clients at runtime —
  a pin swap alone caps the score at 74.2 forever.
- Design (per MIGRATION.md + wheel inspection):
  - 2.0.0 wheel layout: no composio_client.types package; models in
    composio_client/_generated/pydantic_gen.py; resources tree matches the
    accessor paths; errors unchanged; NO with_raw_response/streaming/file
    upload helpers.
  - Plan: (1) version gate in python/composio/client/ (importlib.metadata
    major → IS_V2). (2) Migrate SDK call sites to the 2.0.0 convention
    (positional path params + single body/query mapping + request_options)
    per MIGRATION.md. (3) A small v1 adapter shim in
    python/composio/client/ that, when Stainless 1.43 is installed, maps
    the 2.0.0-style invocation back to Stainless kwargs
    (body dict → **kwargs; query dict → **kwargs; special-case the
    files.* methods whose v1 signatures mix positional/kw path params).
    (4) client/types.py: conditional imports — Stainless typed aliases
    under v1, hey-api pydantic equivalents (or t.Any fallbacks where
    typing-only) under v2. (5) Audit runtime (non-typing) uses of
    composio_client.types across ~19 files. (6) python/tests green under
    BOTH: pytest with 1.43 (workspace) and with the wheel overlaid
    (uv run --with $COMPOSIO_CLIENT_WHEEL). (7) Score: expect C_py stays
    22/22 and P_py rises toward 22/22 → score toward ~99 dev.
- Expected failure modes: RootModel `.root` response-shape differences
  leak into SDK response handling; with_raw_response/streaming usage in
  the SDK (must audit — not ported in 2.0.0); files upload helpers.
- Diagnostic: pytest matrix (v1/v2) + targeted py candidate sweep.
- Audit result (Stage B, task 1):
  - v2 call convention: method(*path_args, body=None, *, query=None,
    headers=None, request_options=None); many list/retrieve responses are
    pydantic RootModel (payload under .root) — incl. tools.list and
    tools.retrieve. v2 exports NO NotGiven/NOT_GIVEN/omit; RequestOptions
    replaces extra_headers/timeout/max_retries kwargs. No _prepare_request
    hook, no copy/with_options; constructor kwargs match v1 minus
    _strict_response_validation; per-request RequestOptions(max_retries=)
    exists; httpx event hooks usable for per-request telemetry headers.
  - SDK touchpoints: ~35 resource methods (all exist in v2); raw verbs
    get/patch/post at 4 sites (triggers webhook subs + internal realtime
    creds; v1 options={"params": ...} → v2 query=...); with_raw_response
    1 site with graceful fallback; not_given via client attr +
    none_to_omit(omit) in utils/pydantic.py; typed imports from
    composio_client.types in client/types.py (+ models) — v2 has NO types
    package (models in _generated/pydantic_gen.py).
  - Facade design (implementing): python/composio/client/compat.py with
    an OMIT sentinel + ResourceProxy/MethodProxy translating the SDK's
    v2-style calls to either backend (v1: splat body/query as kwargs,
    request_options→extra_*; v2: pass through + RootModel .root
    unwrapping). HttpClient becomes a facade (composition, not
    inheritance): v1 backend keeps the existing Stainless subclass with
    _prepare_request; v2 backend = 2.0.0 client with static telemetry in
    default_headers + httpx event hook for x-request-id; without_retries =
    cached sibling (v1 with_options / v2 second client, max_retries=0).
    Call sites then migrate file-by-file to the v2 convention; tests
    updated where they assert kwargs-style calls.
