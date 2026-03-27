---
  Composio CLI vs Rube MCP — Comprehensive Comparison Report

  Test Matrix

  ┌──────────────────────────────────────────────────┬───────────┬───────────┬────────────────────────────────────────────────────────┐
  │                     Service                      │ MCP Score │ CLI Score │                   Key Differentiator                   │
  ├──────────────────────────────────────────────────┼───────────┼───────────┼────────────────────────────────────────────────────────┤
  │ Slack (590 channels, pagination, parallel fetch) │ 5/10      │ 4/10      │ MCP workbench died silently; CLI run broken            │
  ├──────────────────────────────────────────────────┼───────────┼───────────┼────────────────────────────────────────────────────────┤
  │ Linear (GraphQL, LLM summarization)              │ 6.5/10    │ 7/10      │ CLI proxy + error msgs shine; MCP workbench unreliable │
  ├──────────────────────────────────────────────────┼───────────┼───────────┼────────────────────────────────────────────────────────┤
  │ Plain (GraphQL, thread analysis)                 │ 6.5/10    │ 4/10      │ MCP bash fallback worked; CLI run + proxy broken       │
  ├──────────────────────────────────────────────────┼───────────┼───────────┼────────────────────────────────────────────────────────┤
  │ Average                                          │ 6.0       │ 5.0       │                                                        │
  └──────────────────────────────────────────────────┴───────────┴───────────┴────────────────────────────────────────────────────────┘

  ---
  1. Tool Discovery

  ┌────────────────┬───────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
  │   Dimension    │                       Rube MCP (RUBE_SEARCH_TOOLS)                        │      Composio CLI (composio search)      │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Plans          │ Recommended plan steps with prerequisites                                 │ Same engine, equally rich plans          │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Pitfalls       │ Known pitfalls per tool (double-nested responses, rate limits)            │ Same pitfalls, equally detailed          │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Schemas        │ Inline for primary tools, schemaRef for others (requires                  │ Full schemas inline for all tools — no   │
  │                │ RUBE_GET_TOOL_SCHEMAS which returned 404!)                                │ extra call needed                        │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Connection     │ Inline check (has_active_connection: true)                                │ Same — shows all connected accounts with │
  │ status         │                                                                           │  metadata                                │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Code snippets  │ Python reference snippets                                                 │ Same Python snippets (slight mismatch —  │
  │                │                                                                           │ CLI is JS/TS)                            │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Session        │ session_id for workflow correlation                                       │ session_id returned but less utilized    │
  │ tracking       │                                                                           │                                          │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Multi-query    │ Multiple queries in single call                                           │ One query per call                       │
  ├────────────────┼───────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Speed          │ ~3s                                                                       │ ~1.5–3.4s                                │
  └────────────────┴───────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────┘

  Verdict: Tie (9/10 each). Both use the same underlying engine. CLI bundles schemas more completely. MCP supports batched queries. Both are
  best-in-class for tool discovery.

  ---
  2. Tool Execution

  ┌────────────────┬──────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────┐
  │   Dimension    │                MCP (RUBE_MULTI_EXECUTE_TOOL)                 │                CLI (composio execute)                 │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Parallelism    │ Up to 50 tools per call, server-side parallel                │ Single tool per call (no parallelism without composio │
  │                │                                                              │  run)                                                 │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Response       │ Auto-saves large responses to sandbox files with             │ Auto-saves to /tmp/composio/cli_*/ when response      │
  │ handling       │ structure_info and data_preview                              │ exceeds token threshold                               │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ JSON input     │ Structured JSON via MCP protocol                             │ -d flag accepts JSON, JS-style objects, @file, or     │
  │                │                                                              │ stdin                                                 │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Dry run        │ Not available                                                │ --dry-run validates without executing                 │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Schema fetch   │ Via RUBE_GET_TOOL_SCHEMAS (broken — returned 404)            │ --get-schema flag on execute                          │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Speed          │ ~5s per batch (50 tools)                                     │ ~1.7–2.5s per single tool                             │
  ├────────────────┼──────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Sandbox        │ None — remote execution                                      │ EPERM on ~/.composio/ cache files in sandboxed        │
  │ friction       │                                                              │ environments                                          │
  └────────────────┴──────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────┘

  Verdict: MCP wins for bulk operations (50 parallel tools in one call). CLI wins for single operations (faster, dry-run, better error
  messages).

  ---
  3. Scripting / Data Processing

  ┌──────────────┬──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
  │  Dimension   │   MCP (RUBE_REMOTE_WORKBENCH + RUBE_REMOTE_BASH_TOOL)    │                      CLI (composio run)                      │
  ├──────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Language     │ Python (workbench) / Bash                                │ TypeScript/JavaScript (Bun)                                  │
  ├──────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ State        │ Jupyter notebook model — variables survive across cells; │ Single-shot execution — no state between runs                │
  │ persistence  │  /tmp/ file sharing                                      │                                                              │
  ├──────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │              │ CRITICAL BUG: Workbench silently failed in 12/17 calls   │ CRITICAL BUG: composio run is 100% broken — Bun can't        │
  │ Reliability  │ across all 3 MCP agents. No error, no output, no         │ resolve /$bunfs/services/run-subagent-shared.js. Even        │
  │              │ indication of failure. RUBE_REMOTE_BASH_TOOL was 100%    │ console.log("hello") fails.                                  │
  │              │ reliable as fallback.                                    │                                                              │
  ├──────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Built-in     │ run_composio_tool(), invoke_llm(), proxy_execute()       │ execute(), search(), proxy(), subAgent(), z (zod)            │
  │ helpers      │                                                          │                                                              │
  ├──────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ LLM          │ invoke_llm(prompt, reasoning_effort) — worked when       │ subAgent(prompt, {schema}) — untestable due to broken        │
  │ integration  │ workbench cooperated                                     │ runtime                                                      │
  ├──────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Parallelism  │ ThreadPoolExecutor in Python (but crashed kernel in      │ Promise.all() in JS (untestable)                             │
  │              │ Slack test)                                              │                                                              │
  └──────────────┴──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘

  Verdict: Both critically broken, but MCP has a working fallback. MCP's RUBE_REMOTE_BASH_TOOL saved every workflow. CLI has zero fallback when
   composio run fails.

  ---
  4. Data Pipeline / Multi-Step Workflows

  ┌─────────────────────┬────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────┐
  │      Dimension      │                                MCP                                 │                    CLI                     │
  ├─────────────────────┼────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ State passing       │ /tmp/ files on remote sandbox + .composio/mex/ auto-saved files    │ No shared state — must use shell pipes or  │
  │                     │                                                                    │ external scripts                           │
  ├─────────────────────┼────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Pagination loops    │ Workbench while-loop (when working) or manual cursor threading via │ Manual cursor threading via sequential     │
  │                     │  sequential MULTI_EXECUTE calls                                    │ composio execute calls                     │
  ├─────────────────────┼────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Data transformation │ Python stdlib (json, collections, datetime) in bash or workbench   │ Would need composio run (broken) or        │
  │                     │                                                                    │ external jq/python3                        │
  ├─────────────────────┼────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Cross-step file     │ Shared filesystem between workbench and bash tool                  │ No shared filesystem — each execute is     │
  │ access              │                                                                    │ independent                                │
  └─────────────────────┴────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────┘

  Verdict: MCP wins significantly. Even with the workbench bugs, the remote sandbox with shared filesystem and bash fallback enables real data
  pipelines. CLI without composio run is limited to single-shot tool calls.

  ---
  5. Unique Capabilities (No Equivalent in the Other)

  MCP-Only

  ┌──────────────────────────────────────────┬────────────────────────────────────────────────────────────────────┐
  │                 Feature                  │                    Value for Activity Summaries                    │
  ├──────────────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Recipes (RUBE_CREATE_UPDATE_RECIPE)      │ Save the entire summary workflow as a reusable recipe              │
  ├──────────────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Scheduling (RUBE_MANAGE_RECIPE_SCHEDULE) │ Run summaries on a daily cron schedule automatically               │
  ├──────────────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ invoke_llm()                             │ LLM summarization within the data pipeline                         │
  ├──────────────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Remote sandbox                           │ Process large datasets without local resource constraints          │
  ├──────────────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Memory parameter                         │ Store durable facts (channel IDs, user mappings) across tool calls │
  ├──────────────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ 50-tool parallel execution               │ Fan out to 590 channels in 12 batches                              │
  └──────────────────────────────────────────┴────────────────────────────────────────────────────────────────────┘

  CLI-Only

  ┌─────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────┐
  │           Feature           │                             Value for Activity Summaries                             │
  ├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ composio proxy              │ Direct API access with auth injection — worked for Linear, bypasses tool abstraction │
  ├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ composio dev logs           │ Debug failed tool executions with full log history                                   │
  ├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ composio dev triggers       │ Full CRUD on webhook/polling triggers                                                │
  ├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ --dry-run                   │ Validate tool calls without side effects                                             │
  ├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ subAgent() with zod schemas │ Structured LLM output (untestable but well-designed)                                 │
  ├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ Local execution             │ No remote sandbox latency, no shared-state bugs                                      │
  └─────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────┘

  ---
  6. Critical Bugs Found

  ┌──────────────────────────────────────────────────┬──────────┬───────────────────────────┬──────────────────────────────────────────────┐
  │                       Bug                        │ Severity │          Affects          │                    Impact                    │
  ├──────────────────────────────────────────────────┼──────────┼───────────────────────────┼──────────────────────────────────────────────┤
  │ composio run broken (Bun $bunfs module           │ P0       │ All CLI workflows         │ Eliminates scripting, chaining, subAgent,    │
  │ resolution)                                      │          │                           │ parallel execution                           │
  ├──────────────────────────────────────────────────┼──────────┼───────────────────────────┼──────────────────────────────────────────────┤
  │ RUBE_REMOTE_WORKBENCH silent failure (12/17      │ P0       │ All MCP workflows         │ Forces bash fallback; invoke_llm only        │
  │ calls returned no output)                        │          │                           │ available in workbench                       │
  ├──────────────────────────────────────────────────┼──────────┼───────────────────────────┼──────────────────────────────────────────────┤
  │ MCP session isolation (Slack logs leaked into    │ P1       │ Multi-tenant / concurrent │ Data contamination risk                      │
  │ Linear session)                                  │          │  workflows                │                                              │
  ├──────────────────────────────────────────────────┼──────────┼───────────────────────────┼──────────────────────────────────────────────┤
  │ RUBE_GET_TOOL_SCHEMAS 404                        │ P2       │ Schema resolution         │ Forces workaround via workbench              │
  │                                                  │          │                           │ run_composio_tool                            │
  ├──────────────────────────────────────────────────┼──────────┼───────────────────────────┼──────────────────────────────────────────────┤
  │ CLI sandbox friction (EPERM on ~/.composio/      │ P2       │ All CLI in sandboxed envs │ Requires dangerouslyDisableSandbox           │
  │ cache)                                           │          │                           │                                              │
  ├──────────────────────────────────────────────────┼──────────┼───────────────────────────┼──────────────────────────────────────────────┤
  │ composio proxy 404 for Plain                     │ P2       │ Plain direct API access   │ Works for Linear but not Plain —             │
  │                                                  │          │                           │ inconsistent                                 │
  └──────────────────────────────────────────────────┴──────────┴───────────────────────────┴──────────────────────────────────────────────┘

  ---
  7. How Would You Design the Skill for CLI?

  The current skill was designed for MCP and relies heavily on RUBE_REMOTE_WORKBENCH for multi-step Python pipelines. Here's how it would need
  to change for CLI:

  Architecture Change: Script-File Based

  skills/
    company-activity-summary/
      scripts/
        slack.ts          # composio run -f slack.ts
        linear.ts         # composio run -f linear.ts
        plain.ts          # composio run -f plain.ts
        notion.ts         # composio run -f notion.ts
        metabase.ts       # composio run -f metabase.ts
        github.ts         # composio run -f github.ts
      SKILL.md            # Orchestration instructions

  Each script would be a self-contained TypeScript file using injected helpers:

  // slack.ts
  const channels = [];
  let cursor: string | undefined;
  do {
    const result = await execute("SLACK_LIST_ALL_CHANNELS", {
      types: "public_channel", limit: 500, cursor
    });
    channels.push(...(result?.data?.channels || []));
    cursor = result?.data?.response_metadata?.next_cursor;
  } while (cursor);

  // Parallel message fetching
  const messages = await Promise.all(
    channels.slice(0, 50).map(ch =>
      execute("SLACK_FETCH_CONVERSATION_HISTORY", { channel: ch.id, limit: 200 })
    )
  );

  // LLM summarization
  const summary = await subAgent(
    `Summarize this Slack activity: ${JSON.stringify(messages.map(m => m?.data?.messages))}`,
    { schema: z.object({ highlights: z.array(z.string()), themes: z.array(z.string()) }) }
  );
  console.log(JSON.stringify(summary.structuredOutput));

  Key Design Differences

  ┌─────────────────┬──────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
  │     Aspect      │                   MCP Skill Design                   │                       CLI Skill Design                       │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Language        │ Python scripts run in remote workbench               │ TypeScript files run locally via composio run -f             │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ State passing   │ /tmp/ files between workbench cells                  │ In-memory variables within a single script                   │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Parallelism     │ RUBE_MULTI_EXECUTE_TOOL (declarative, 50 tools)      │ Promise.all() with execute() (programmatic)                  │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ LLM calls       │ invoke_llm() in workbench                            │ subAgent() with zod schemas                                  │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Orchestration   │ Claude Code launches 6 background agents, each calls │ Claude Code launches 6 background agents, each runs composio │
  │                 │  MCP tools                                           │  run -f <script>                                             │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Error handling  │ Check err tuple return                               │ Check response successful field                              │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Direct API      │ proxy_execute() in workbench                         │ proxy(toolkit) returning fetch — or composio proxy           │
  │ access          │                                                      │                                                              │
  ├─────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
  │ Scheduling      │ Save as recipe + RUBE_MANAGE_RECIPE_SCHEDULE         │ Not possible — would need external cron                      │
  └─────────────────┴──────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘

  CLI Skill Would Be Simpler But Less Capable

  The CLI design is more self-contained (one TS file per service, no remote state) but loses:
  - Recipe creation and scheduling (no CLI equivalent)
  - 50-tool declarative parallelism (must write Promise.all loops)
  - Remote sandbox (all processing is local)
  - invoke_llm with reasoning_effort control (subAgent is different — it spawns a full agent)

  ---
  8. Final Verdict

  For the Company Activity Summary Use Case

  MCP wins, but narrowly and with caveats.

  MCP's advantages are structural: remote sandbox, 50-tool parallel execution, recipes + scheduling, and invoke_llm. These are the right
  primitives for a data pipeline that touches 6 services, paginates hundreds of records, and needs LLM summarization.

  But the workbench reliability crisis (70% silent failure rate across 17 calls) nearly negates this. The RUBE_REMOTE_BASH_TOOL fallback saved
  every workflow, but it lacks invoke_llm and notebook persistence.

  If both were fully working:
  - MCP would score 8.5/10 — the recipe + scheduling + parallel execution stack is purpose-built for this use case
  - CLI would score 8/10 — composio run with execute(), Promise.all(), and subAgent() is an elegant scripting model that's simpler than MCP's
  multi-tool orchestration

  Recommendations

  1. Fix composio run — This is a P0 for CLI. The Bun module resolution bug (run-subagent-shared.js) blocks the entire scripting surface. One
  fix unlocks the whole CLI.
  2. Fix workbench reliability — The silent failure mode needs loud errors. Add kernel health checks, auto-restart on crash, and explicit
  timeout messages.
  3. Add invoke_llm to RUBE_REMOTE_BASH_TOOL — Since workbench is unreliable, the bash tool needs LLM access as a fallback.
  4. Add batch/template mode to RUBE_MULTI_EXECUTE_TOOL — Instead of constructing 50 tool entries manually, allow: "template": {"tool_slug":
  "SLACK_FETCH_CONVERSATION_HISTORY", "iterate_over": channelIds, "argument_key": "channel"}.
  5. Fix session isolation — Cross-session stdout contamination is a data integrity risk in multi-tenant environments.
  6. CLI sandbox compatibility — The ~/.composio/ cache writes should gracefully degrade or respect XDG_STATE_HOME.

⏺ That's the complete comparison. The TL;DR:

  - composio search is world-class on both platforms (plans, pitfalls, schemas in one call)
  - Both scripting runtimes are critically broken: composio run (Bun module bug) and RUBE_REMOTE_WORKBENCH (70% silent failure rate)
  - MCP wins for this use case due to recipes/scheduling, 50-tool parallel execution, and remote sandbox — but only because
  RUBE_REMOTE_BASH_TOOL acts as a reliable fallback
  - CLI would be competitive if composio run worked — the execute() + Promise.all() + subAgent() with zod is a cleaner programming model than
  MCP's multi-tool orchestration
  - 6 concrete fixes would dramatically improve both platforms