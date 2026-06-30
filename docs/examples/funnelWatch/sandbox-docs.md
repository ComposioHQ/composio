> **Renamed from workbench**: This feature used to be called the **workbench**. The preferred session config key is now `sandbox`, but `workbench` still works as a fully supported alias, in both SDKs and on the wire. It isn't deprecated, so existing code keeps running unchanged. The `COMPOSIO_REMOTE_WORKBENCH` and `COMPOSIO_REMOTE_BASH_TOOL` meta tools keep their names.

## 2. CRITICAL INSTRUCTIONS FOR AI MODELS

### 2.1 — ALWAYS DO THE FOLLOWING

1. **Use `composio.create(user_id)`** to create a session — this is the entry point for all Composio integrations.
2. **Use `session.tools()`** for native tool integration or **`session.mcp.url`** for MCP integration.
3. **Import** from the correct provider package (`composio_<provider>` for Python, `@composio/<provider>` for TypeScript).
4. **Pass `user_id` to `composio.create()`**, not to individual tool calls.

### 2.2 — NEVER DO THE FOLLOWING

1. **Do not** instruct users to manually create auth configs or connected accounts before running.
2. **Do not** import from `composio_openai` / `@composio/openai` when using OpenAI Agents SDK — use `composio_openai_agents` / `@composio/openai-agents` instead.

### 2.3 — DISCOURAGED (do not use unless user explicitly asks)

Do **not** generate `composio.tools.get()`, `composio.tools.execute()`, or `composio.provider.handle_tool_calls()` unless the user explicitly requests direct tool execution. These are a supported but **not recommended** low-level interface.



## Terminology Migration (old → current)

If you encounter these terms in error messages, old documentation, or user prompts, translate them to the current equivalents. **Do not use the old terms in generated code or explanations.**

| Old term (v1/v2) | Current term (v3) | In code |
|---|---|---|
| entity ID | user ID | `user_id` parameter |
| actions | tools | e.g., `GITHUB_CREATE_ISSUE` is a *tool* |
| apps / appType | toolkits | e.g., `github` is a *toolkit* |
| integration / integration ID | auth config / auth config ID | `auth_config_id` parameter |
| connection | connected account | `connected_accounts` namespace |
| ComposioToolSet / OpenAIToolSet | `Composio` class with a provider | `Composio(provider=...)` |
| toolset | provider | e.g., `OpenAIProvider` |

If a user says "entity ID", they mean `user_id`. If they say "integration", they mean "auth config". Always respond using the current terminology.


# Composio SDK — Instructions for AI Code Generators

**Purpose:** Enforce only the **current** and **correct** patterns for integrating [Composio](https://composio.dev/) tools into AI agents.
**Scope:** All AI-generated code using Composio must follow these guardrails.

---

## 1. Correct Composio Integration

Composio supports two integration modes: **Native Tools** (with a provider package) and **MCP** (no provider package needed).

### Native Tools

```python
# ✅ CORRECT — Python (defaults to OpenAI)
from composio import Composio

composio = Composio()
session = composio.create(user_id="user_123")
tools = session.tools()
# Pass tools to your agent/LLM framework
```

```typescript
// ✅ CORRECT — TypeScript (defaults to OpenAI)
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.create("user_123");
const tools = await session.tools();
// Pass tools to your agent/LLM framework
```

For other providers, pass the provider explicitly. Provider packages follow the naming convention: `composio_<provider>` for Python, `@composio/<provider>` for TypeScript.

### MCP

Use `session.mcp.url` and `session.mcp.headers` with any MCP-compatible client (Claude Desktop, Cursor, OpenAI Agents, etc.). No provider package needed.

---
## Automatic error correction

The sandbox corrects common mistakes in the code your agent generates. For example, if a script accesses `result["apiKey"]` but the actual field name is `api_key`, the sandbox resolves the mismatch instead of failing

 The filesystem will survive session restarts, but in-memory state won't.

 ommon packages pre-installed: `pandas`, `numpy`, `matplotlib`, `Pillow`, `PyTorch`, and `reportlab`. Beyond these, the sandbox maintains a list of supported packages and their dependencies. If the agent uses a package that isn't already installed, the sandbox installs it automatically.

 ## com

Sandboxes default to `standard` (1 vCPU, 1 GB RAM). For heavier workloads (large dataframes, ML preprocessing, or big bulk operations), pick a larger tier when creating the session via `sandbox.sandboxSize` (TypeScript) or `sandbox.sandbox_size` (Python).

Available tiers:

* `standard` (1 vCPU, 1 GB RAM)
* `medium` (2 vCPU, 2 GB)
* `large` (4 vCPU, 4 GB)
* `xlarge` (8 vCPU, 8 GB)

Larger tiers require `@composio/core` ≥ `0.8.1` or `composio` ≥ `0.12.1`. See [Configuring sessions → Sandbox compute tier](/docs/configuring-sessions#sandbox-compute-tier) for examples.

> **Pricing:** Sandboxes are not billed today. Composio plans to begin billing for sandbox usage soon (metered by tier and runtime).




# info to add
One tradeoff worth naming: webhooks give you a continuous event stream (every churn, every failed payment as it happens). Agent tool-pull gives you current-state snapshots on demand. For "what's our MRR now" pull is perfect; for "show me every failed payment today" you still want the event stream. So you may keep triggers feeding events and let the agent pull state — they're complementary, not either/or.

Blocking — need exact signatures

1. run_composio_tool — exact call signature. Slug + args dict? What's the return shape? And critically: how does it resolve auth — does it automatically use the session's connected accounts, and does it respect the session's read-only toolkit allowlist, or can in-sandbox code call any tool? (This decides whether our read-only guarantee still holds.)
2. invoke_llm — signature (prompt string vs. messages?), which model, and whose keys/billing (Composio-managed vs. our OPENAI_API_KEY)? This determines whether the agent can cheaply reason inside the sandbox and whether we control the model.
3. web_search, proxy_execute, upload_local_file, smart_file_extract — signatures + return types (esp. upload_local_file → download URL shape, and proxy_execute for the auth'd-but-no-tool case).

Architecture / steering

4. Which meta-tools should the session expose now? If the agent does everything via workbench code + helpers, do we still want MULTI_EXECUTE exposed, or narrow to mostly REMOTE_WORKBENCH (+ SEARCH_TOOLS for discovery)?
5. Tool discovery for in-sandbox calls — to write a correct run_composio_tool("STRIPE_…", {...}), the agent needs the slug + arg schema. Does it get that from the SEARCH_TOOLS/GET_TOOL_SCHEMAS meta-tools first, then write workbench code? Or is there an in-sandbox discovery helper?
6. Are the helpers truly global in the sandbox (no import), so the agent's code can just call run_composio_tool(...) directly?

Operational

7. Workbench execution timeout — if the agent's code does a sub-loop (several invoke_llm + run_composio_tool calls in one execution), what's the per-execution time limit? Affects how much we let it do per step.
8. Confirm the code arg — live testing already showed it's code_to_execute (the docs don't state it); just want that confirmed as stable.


1. Session isolation (my biggest one). We run a single long-lived session per user_id. Cells share persistent Python state and the mount. With many chat questions plus the background alert-enrichment cycle all running cells in that one session, do we risk state collisions / concurrency races in the shared interpreter? Should an agent run get its own (or a pooled) session, or do we rely entirely on writing self-contained cells?

2. Read-only enforcement — confirm the semantics. We create the session with toolkits=[stripe, hubspot, …] (our read set). Is that an allowlist that denies everything else (so in-cell run_composio_tool("STRIPE_REFUND…") is blocked), or does it just preload those and leave other tools callable? The whole read-only guarantee now rests on this.

3. Confirm the target shape. Host keeps the loop; the agent's primary action becomes REMOTE_WORKBENCH cells using helpers; we drop reliance on host MULTI_EXECUTE (since cells must not call COMPOSIO_* meta-tools anyway). Keep SEARCH_TOOLS for discovery. Good?

4. Two LLM paths — OK? The control loop must stay on our OpenAI client (it needs tool-calling via the Responses API). invoke_llm is Composio-managed and can't drive tool calls, so it's only for in-cell semantic subtasks. So we'd have: host decision LLM = ours, in-cell semantic LLM = Composio's. Acceptable, or do you want the decision LLM routed differently?

5. Tool discovery for cells. To write run_composio_tool("STRIPE_…", {...}) correctly, the agent needs slugs + arg schemas. Plan: SEARCH_TOOLS (host) to find slugs, then print_schema_for_tool=True inside a cell to get the arg schema. Or should I just hardcode our six toolkits' common slugs into the system prompt? (reasoning_effort default and the /mnt→/tmp caveat I'll just bake into the prompt — not blocking.)

#1 and #2 are the ones I'd want settled before building — they're the isolation and security story. Everything else I can decide and you can correct.

- Auth/read-only ✅ auto-injected for the session's user; session tool-blocks apply to the workbench too → our read-only allowlist holds if the session config actually blocks writes (one thing to confirm, below).
- invoke_llm ✅ (query, reasoning_effort?) -> (resp, err), you control the model via effort, ≤200k chars.
- Signatures + the error-first (result, error) tuple convention ✅ for all helpers.
- Globals, not imports ✅ (PRELOADED_SANDBOX_HELPERS, and code must not import them or call COMPOSIO_* meta-tools from a cell).
- 3-minute cell timeout ✅ and the big one: /mnt/files is a FUSE mount — don't do heavy I/O there; work in /tmp and copy results back.

And the key architectural correction from the prose: "the loop runs in your external application; the sandbox is the execution runtime." So this isn't "move the loop into the sandbox" — it's keep the host run_agent loop, but have the agent act through REMOTE_WORKBENCH cells that use the helpers (run_composio_tool for Stripe/HubSpot, invoke_llm for semantic subtasks). Tool calls move into the sandbox; my host loop's structure was actually right. Smaller change than a rewrite.

Remaining questions

1. Session isolation (my biggest one). We run a single long-lived session per user_id. Cells share persistent Python state and the mount. With many chat questions plus the background alert-enrichment at one session, do we riskstate collisions / concurrency races in the shared interpreter? Should an agent run get
its own (or a pooled) sessiowriting self-contained cells?

2. Read-only enforcement — cte the session withtoolkits=[stripe, hubspot, …] (our read set). Is that an allowlist that denies
everything else (so in-cell UND…") is blocked), or does it just preload those and leave other tools callable? The whole read-only guarantee now
rests on this.

3. Confirm the target shape.nt's primary action becomesREMOTE_WORKBENCH cells using helpers; we drop reliance on host MULTI_EXECUTE (since
cells must not call COMPOSIOEARCH_TOOLS for discovery.Good?

4. Two LLM paths — OK? The control loop must stay on our OpenAI client (it needs tool-calling via the Responsio-managed and can't drivetool calls, so it's only for in-cell semantic subtasks. So we'd have: host decision = ours, in-cell semantic LLM do you want the decision LLM routed differently?                                                                 
5. Tool discovery for cells. To write run_composio_tool("STRIPE_…", {...}) correctlythe agent needs slugs + arg host) to find slugs, thenprint_schema_for_tool=True inside a cell to get the arg schema. Or should I just    hardcode our six toolkits' crompt? (reasoning_effortdefault and the /mnt→/tmp caveat I'll just bake into the prompt — not blocking.)    
#1 and #2 are the ones I'd want settled before building — they're the isolation and security story. Everything ecorrect.




 is the mount per-session or per-user? If each session gets its own /mnt, then pooled/ephemeral sessions wouldn't see the event data we ingested into the long-lived session's mount — we'd lose the shared data or have to re-stage it every time. If the mount is shared per-user, pooling is clean. I can't tell which from the docs — that's a real thing to confirm.


3) You're right — I shouldn't have said "drop MULTI_EXECUTE"

There are two levels and I conflated them:
- Host level: the model can call MULTI_EXECUTE (direct tool) or REMOTE_WORKBENCH (write a cell). Both fine.
- Cell level: inside a cell's Python, use run_composio_tool; the "don't call COMPOSIO_* meta-tools" rule is only about cell code (avoiding recursion).

So that rule is a cell constraint, not a reason to drop host MULTI_EXECUTE. Keep both. The only time to prefer in-cell run_composio_tool is when the agent wants to fetch and compute in one go so data stays in the sandbox. For a simple one-off read, MULTI_EXECUTE is perfectly good.
 


idea on tool scoping/deny list

Move files between your app and the mount with `session.experimental.files`. Upload an input file and the agent reads it at `/mnt/files/<path>`. When the agent writes a result, download it from your app.

> The files API ships under `session.experimental`, so the surface may change in a future release.

**Python:**

```python
session = composio.create("user_123")

# Upload a local file; the sandbox sees it at /mnt/files/sales.csv
uploaded = session.experimental.files.upload("./sales.csv")
print(uploaded.sandbox_mount_prefix, uploaded.mount_relative_path)
# /mnt/files sales.csv

# After the agent writes a result in the sandbox, download it
report = session.experimental.files.download("/report.pdf")
report.save("./report.pdf")
```

**TypeScript:**

```typescript
import { Composio } from '@composio/core';
const composio = new Composio({ apiKey: 'your_api_key' });
const session = await composio.create("user_123");

// Upload a local file; the sandbox sees it at /mnt/files/sales.csv
const uploaded = await session.experimental.files.upload("./sales.csv");
console.log(uploaded.sandboxMountPrefix, uploaded.mountRelativePath);
// /mnt/files sales.csv

// After the agent writes a result in the sandbox, download it
const report = await session.experimental.files.download("/report.pdf");
await report.save("./report.pdf");
```

The mount exposes four methods:

| Method                     | What it does                                                                |
| -------------------------- | --------------------------------------------------------------------------- |
| `upload(input, options?)`  | Upload from a local path, URL, `File`, or buffer. Returns a `RemoteFile`.   |
| `list(options?)`           | List files under `path` on the mount, with `cursor` and `limit` pagination. |
| `download(path, options?)` | Fetch a file from the mount as a `RemoteFile`.                              |
| `delete(path, options?)`   | Remove a file or directory from the mount.                                  |

A `RemoteFile` carries the file's bytes and a presigned `downloadUrl`. Read it with `text()` or `buffer()`, or write it to disk with `save(path)`. Its `expiresAt` is when that download link expires, not a TTL on the file: the mount itself has no expiry you set.

Every file lives on the session's default `files` mount, surfaced at `/mnt/files/`. Each method takes a `mountId` to address a mount by ID, but there's no SDK call to create custom mounts today, so you'll normally work with `files`.