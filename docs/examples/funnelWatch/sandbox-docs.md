# Composio Sandbox — Architecture & Integration Guide

**Purpose:** everything needed to one-shot a correct Composio **sandbox** (a.k.a. workbench)
integration. It captures the working patterns, the architectural decisions with their
tradeoffs, our opinionated defaults, and the questions still open. Read the TL;DR, then the
mental model, then steal the verified loop in §2.

> **Naming:** the feature was called the **workbench**; the preferred session-config key is now
> `sandbox`, but `workbench` is a fully supported alias (SDKs + wire). The meta-tools keep their
> names: `COMPOSIO_REMOTE_WORKBENCH` (Python) and `COMPOSIO_REMOTE_BASH_TOOL` (bash).

---

## TL;DR — our opinionated defaults

| Decision | Options | **Our default** | Why |
|---|---|---|---|
| Where the agent loop runs | host-driven tool-router · sandbox-resident | **host-driven** | Docs: *"the loop runs in your external application; the sandbox is the execution runtime."* No autonomous-agent abstraction exists. |
| Session strategy | one long-lived · per-run · pooled | **one long-lived** | The mount is **per-session**; reuse keeps ingested data available. |
| Concurrency control | lock (serialize) · pool | **a single lock** | Cells share one persistent interpreter; our concurrency is tiny. |
| Read-only enforcement | allowlist · denylist · account scopes · prompt | **prompt-level + read-scoped accounts** | There is **no allowlist**; the real boundary is the connected account's OAuth scopes. |
| Deterministic analytics | ship to sandbox · run on host | **host, in-process** | Small/fast; the sandbox is for the *agent's* ad-hoc code, not host infra. |
| Ingest path | run cycle synchronously · background | **fast ingest + background coalesced cycle** | Synchronous sandbox/network work per webhook blows past client timeouts. |
| Tool calls | host `MULTI_EXECUTE` · in-cell `run_composio_tool` | **both; prefer in-cell for fetch+compute** | In-cell keeps data in the sandbox; `MULTI_EXECUTE` is fine for a simple read. |
| Decision LLM | your own client · `invoke_llm` | **your own client for the loop**; `invoke_llm` only for in-cell subtasks | `invoke_llm` can't drive tool calls. |

---

## 1. Mental model — three places code runs

```
┌─ HOST (your app process) ─────────────┐      ┌─ SANDBOX (a Composio VM) ─┐
│ the agent loop CONTROLLER (LLM calls) │      │ runs the agent's own       │
│ ingest, deterministic analytics       │◀───▶ │ Python "cells" over /mnt   │
│ your datastores (SQLite, files)       │mount │ helpers: run_composio_tool,│
└───────────────────────────────────────┘ API  │ invoke_llm, web_search…    │
            ▲                                   └────────────────────────────┘
            └──────────── MOUNT (/mnt/files, per session) ───────┘
```

- **Host** — your application. The agent loop's *control plane* (the LLM that decides the next
  step) lives here, plus anything deterministic you own (ingestion, fixed analytics, your DB).
- **Sandbox** — a remote VM. Runs **only the code the agent writes**, submitted as "cells" via
  `COMPOSIO_REMOTE_WORKBENCH`. The host never ships/maintains code here.
- **Mount** — `/mnt/files/`, persistent storage **scoped to the session**. The sandbox sees it as
  a filesystem path; the host reads/writes the same bytes via the files API (it has no local
  `/mnt`). It's a **FUSE mount backed by cloud storage** — see §5.

Three execution locations, not two: **host** (your code + the deciding LLM), **Composio backend**
(tool calls — `MULTI_EXECUTE` from the host *or* `run_composio_tool` from a cell), and the
**sandbox VM** (the agent's cells). Tool calls always go *through Composio* regardless of origin.

---

## 2. The agent loop (host-driven tool-router) — verified pattern

This is the loop we run in production. The host calls the Responses API with the session's
meta-tools; the model emits tool calls; the host executes each via `session.execute`; results are
fed back until the model stops calling tools.

```python
from composio import Composio
from composio_openai import OpenAIResponsesProvider
from openai import OpenAI

composio = Composio(provider=OpenAIResponsesProvider())
openai = OpenAI()

# One long-lived session (see §6). `sandbox` is the preferred key; `workbench` is an alias.
session = composio.create(
    user_id="growth-pulse",
    toolkits=["stripe", "hubspot", "slack"],          # lowercase slugs (preloads them)
    sandbox={"enable": True, "sandbox_size": "standard"},
)

tools = session.tools()        # provider-wrapped META-tools (see §2.1)
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},      # see §4 for what to put here
    {"role": "user",   "content": question},
]
for _ in range(MAX_STEPS):                              # bound the loop (we use 8)
    resp = openai.responses.create(model=MODEL, tools=tools, input=messages)
    calls = [it for it in (resp.output or []) if getattr(it, "type", None) == "function_call"]
    if not calls:                                      # no tool call → final answer
        break
    messages += resp.output                            # carry the assistant's calls forward
    for call in calls:
        out = session.execute(call.name, arguments=json.loads(call.arguments or "{}"))
        messages.append({
            "type": "function_call_output",
            "call_id": call.call_id,
            "output": json.dumps(out.data, default=str)[:12000],   # cap what re-enters context
        })
final = (getattr(resp, "output_text", None) or "").strip()
```

### 2.1 The meta-tools `session.tools()` exposes
Observed live (6): `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`,
`COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`,
`COMPOSIO_MANAGE_CONNECTIONS`. The model talks to *these*; it does not see Stripe/HubSpot tools
directly — it discovers them with `SEARCH_TOOLS` and calls them via `MULTI_EXECUTE` or, inside a
cell, via `run_composio_tool`.

### 2.2 Submitting a cell
`COMPOSIO_REMOTE_WORKBENCH`'s code argument is **`code_to_execute`** (confirmed live; the docs
don't state it). i.e. `session.execute("COMPOSIO_REMOTE_WORKBENCH", arguments={"code_to_execute": "<python>"})`.
The model fills this itself when it calls the tool — you don't construct it.

### 2.3 Result shape
`session.execute(...)` returns a `SessionExecuteResponse` with `.data`, `.error`, `.log_id`.
Workbench stdout typically lands in `.data["stdout"]`. Normalize defensively
(`data.get("stdout") or data.get("output") or data.get("result")`).

---

## 3. Cells — the execution unit

A **cell** = one `COMPOSIO_REMOTE_WORKBENCH` call (one chunk of Python). Like a Jupyter cell:

- The sandbox is a **persistent Python interpreter**; **variables, imports, and files persist to
  the next cell** within a session.
- Each cell has a **~3-minute execution limit**. If a cell makes many tool calls, **parallelize**
  them (`concurrent.futures.ThreadPoolExecutor`) so they finish in the window.
- **Treat each task as a fresh workspace** — define what you need; don't rely on variables a
  previous task left in the interpreter (this is how we avoid cross-task state bleed, see §6).
- Cells get **automatic error correction** for minor mistakes (e.g. `result["apiKey"]` vs
  `api_key` is auto-resolved) and **auto-installs** packages not pre-bundled.
- Pre-installed: `pandas`, `numpy`, `matplotlib`, `Pillow`, `PyTorch`, `reportlab` (+ auto-install
  for others).

---

## 4. In-sandbox helpers (full contract)

These are **pre-loaded globals** in every sandbox — **do not `import` them**, and **do not call
`COMPOSIO_*` meta-tools from inside a cell** (causes cycles). Every helper returns an
**`(result, error)` tuple — check `error` first, then parse**.

| Helper | Signature | Notes |
|---|---|---|
| `run_composio_tool` | `(tool_slug: str, arguments: dict, *, account: str=None, print_schema_for_tool: bool=False, retry_params: dict=None) -> (dict, str)` | Run a known tool. Payload is under `result["data"]` (often nested — parse defensively). `print_schema_for_tool=True` prints the tool's input schema first. Auth is auto-injected for the session's user. |
| `invoke_llm` | `(query: str, reasoning_effort: 'low'|'medium'|'high'=None) -> (str, str)` | Semantic subtasks (summarize/classify/extract). **You control the model via `reasoning_effort`**; Composio-managed, not your key. **≤200k chars.** Cannot drive tool calls. |
| `web_search` | `(query: str) -> (str, str)` | Web search (Exa). |
| `proxy_execute` | `(method: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH', endpoint: str, toolkit: str, query_params=None, body=None, headers=None) -> (Any, str)` | Direct authed API call when no tool exists. **One toolkit per call.** |
| `upload_local_file` | `(*file_paths: str) -> (dict, str)` | Upload sandbox files to Composio S3/R2 for user-downloadable artifacts. Multiple files → auto-zipped. Returns `{s3_url, uploaded_file, s3key, …}`. |
| `smart_file_extract` | `(sandbox_file_path: str, show_preview: bool=True) -> (str, str)` | Extract text from PDFs/images/etc. |
| `get_mount_file_url` | `(file_path: str) -> (url, str)` | Shareable download URL for a `/mnt/files` file. |
| `get_mount_file_s3_key` | `(file_path: str) -> (s3_key, str)` | S3 key when a downstream tool wants a raw key, not a URL. |

**Error-first + defensive parsing (the idiomatic pattern):**
```python
res, err = run_composio_tool("STRIPE_LIST_INVOICES", {"limit": 50})
if err:
    print("error:", err)
else:
    data = res.get("data") or {}
    invoices = data.get("invoices") or []
    print("count:", len(invoices))
```
**Parallelize within the 3-min cell:**
```python
import concurrent.futures
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    results = list(ex.map(lambda a: run_composio_tool("HUBSPOT_GET_DEAL", a), accounts))
```

---

## 5. Files & the `/mnt` mount

**`/mnt/files/` is a FUSE mount backed by remote cloud storage — not local disk.**

- ✅ Fine for **reading inputs** and **writing small results** from a cell.
- ❌ **Do NOT** use it as a working dir for heavy I/O (ffmpeg, image transforms, big intermediate
  files). Do heavy work in **`/tmp`** or `/home/user/`, then **copy the final output to
  `/mnt/files/`**.
- **Per-session.** A new session gets a fresh, empty mount — this is why we keep one long-lived
  session (§6).
- The **filesystem survives session restarts; in-memory state does not.** Changing the compute
  tier recreates the sandbox (clears memory) but `/mnt/files/` persists.

**Host ↔ mount via `session.experimental.files`** (note: under `experimental`, surface may change):

| Method | What it does |
|---|---|
| `upload(input, options?)` | Upload from local path / URL / `File` / buffer → `RemoteFile`. |
| `list(options?)` | List under `path`, with `cursor` + `limit` pagination. |
| `download(path, options?)` | Fetch a file as a `RemoteFile`. |
| `delete(path, options?)` | Remove a file or directory. |

```python
uploaded = session.experimental.files.upload("./sales.csv")     # sandbox: /mnt/files/sales.csv
report = session.experimental.files.download("/report.pdf")     # RemoteFile
report.save("./report.pdf")
```
`RemoteFile` carries bytes + a presigned `downloadUrl`: read with `text()` / `buffer()`, or
`save(path)`. `expiresAt` is the **link** expiry, not a file TTL. Everything lives on the default
`files` mount; there's no SDK call to create custom mounts today.

---

## 6. Session lifecycle, isolation & concurrency

**Decision: one long-lived session + a host lock.**

- The mount is **per-session**, so per-run/pooled sessions would *not* see data you ingested into
  another session's mount — you'd lose it or re-stage every time. So **reuse one session** and
  persist its id across restarts (`composio.use(session_id)`; provision with `composio.create`
  on first run / if stale).
- Because cells share one persistent interpreter, **serialize agent runs with a single lock** so
  only one run drives the session at a time → no concurrent-globals race. Our concurrency is tiny
  (interactive chat + occasional background work), so a lock is plenty.
- Combine with the **"fresh workspace per task"** prompt rule so a later run can't accidentally
  read variables a prior run left behind.

**When pooling would make sense:** real concurrency **and** a per-user (shared) mount. Pooling =
keep N warm sessions, each checked out exclusively (a lock per session), state reset on return.
For us it's premature — and blocked by the per-session mount anyway.

---

## 7. Auth & read-only

- **Auth is auto-injected** for the user the session was created with. In-cell `run_composio_tool`
  uses those connected accounts automatically — you don't pass keys.
- **There is no allowlist.** Passing `toolkits=[...]` at creation **preloads** those toolkits; it
  does **not** deny others. So in-cell code could call any connected tool. *Tool-level blocking
  exists* (a denylist), and **session blocks apply to the workbench too**, but there's no "only
  allow these" switch.
- **Therefore read-only is not structural via the toolkit list.** Enforce it with one of:
  1. **Connected-account OAuth scopes** — connect read-only; write tools fail at the API. *(the
     real boundary — our default)*
  2. An explicit **denylist** of write tools — fragile, must enumerate.
  3. **Prompt-level only** — instruct the agent; accept the soft guarantee. *(we accept this for
     now, paired with read-scoped accounts where possible.)*

---

## 8. Don't ship code from the host

The host must **not** upload or maintain scripts in the sandbox. The workbench runs **only code
the agent writes itself**, via `REMOTE_WORKBENCH` in the loop. Corollaries we follow:

- **Deterministic compute you own (fixed analytics, transforms) runs in-process on the host**, not
  shipped to the sandbox. It's small and fast; shipping it only adds network latency + cold-start.
- If you have a "run this generated code in the sandbox" helper on the host, that's the anti-
  pattern — delete it. The agent's own cells replace it.
- The agent's cells can still read host-produced data from `/mnt` (you push data to the mount via
  the files API; you don't push *code*).

---

## 9. Ingest vs analysis — keep the hot path off the sandbox

**Lesson (a real bug we hit):** running a full analyze-everything cycle **synchronously per
inbound event** — when that cycle shipped code to the sandbox + flushed to the mount — took >10s
and tripped client read timeouts.

**Default:** make ingest **fast and local** (normalize + append), and run analysis in a
**background, coalescing worker** (a burst of events triggers one sequential cycle, never stacks,
never blocks the request). Provisioning a session / first cell also pays a **cold-start** (seconds
to ~10s+) — keep it off any latency-sensitive request.

---

## 10. Tool calling — host vs cell (both valid)

- **Host level:** the model can call `MULTI_EXECUTE` (a direct tool call, host-mediated) **or**
  `REMOTE_WORKBENCH` (write a cell). Both are fine.
- **Cell level:** inside a cell, use `run_composio_tool`; **never call `COMPOSIO_*` meta-tools from
  a cell** (cycle-avoidance — this is a *cell* rule, not a reason to drop host `MULTI_EXECUTE`).
- **Prefer in-cell `run_composio_tool`** when the agent wants to **fetch and compute together** so
  the (possibly large) result stays in the sandbox. **Prefer `MULTI_EXECUTE`** for a single simple
  read whose small result you want directly. Composio also has `enable_auto_workbench_offload` —
  large tool responses auto-route into the workbench instead of your context.

---

## 11. Reference

### Session creation
```python
from composio import Composio
composio = Composio()                       # defaults to OpenAI provider
session = composio.create(user_id="user_123")
tools = session.tools()                      # native tools, or session.mcp.url for MCP
```
- Pass `user_id` to `create()`, **not** to individual tool calls.
- For a specific provider, pass it explicitly: `Composio(provider=OpenAIResponsesProvider())`.
  Package naming: `composio_<provider>` (Python) / `@composio/<provider>` (TS).
- Reuse a session across turns with `composio.use(session_id)` — don't create per request.

### Compute tiers
Default `standard` (1 vCPU / 1 GB). Set via `sandbox.sandbox_size` (Py) / `sandbox.sandboxSize`
(TS): `standard` · `medium` (2/2) · `large` (4/4) · `xlarge` (8/8). Larger tiers need
`composio` ≥ 0.12.1 / `@composio/core` ≥ 0.8.1. **Not billed today** (metered billing planned).

### Terminology (old → current)
entity ID → **user ID** (`user_id`) · actions → **tools** (e.g. `GITHUB_CREATE_ISSUE`) · apps →
**toolkits** (`github`) · integration → **auth config** · connection → **connected account** ·
ToolSet → **`Composio` with a provider**.

---

## 12. Gotchas / lessons learned

- **`code_to_execute`** is the workbench code arg (not `code`/`command`) — a wrong guess fails with
  `Validation error: Required at "code_to_execute"`.
- **`/mnt` is FUSE** → heavy I/O in `/tmp`, copy results back.
- **Mount is per-session** → don't expect a new session to see old data.
- **No allowlist** → don't rely on `toolkits=[...]` for read-only.
- **Cold start + per-event sandbox work = timeouts** → ingest fast, analyze in the background.
- **Helpers are globals** → don't `import` them; don't call `COMPOSIO_*` from a cell.
- **`session.tools()` returns META-tools**, not your toolkit's tools — discovery is via
  `SEARCH_TOOLS` + `print_schema_for_tool=True`.
- **Two LLM paths coexist:** your control-loop model (needs tool-calling) + `invoke_llm` for
  in-cell semantic subtasks (no tool-calling). That's expected, not a smell.
- **`session.experimental.files`** is `experimental` — surface may change.
- **Triggers vs pull are complementary:** webhooks give a continuous event stream (every churn /
  failed payment as it happens); agent tool-pull gives current-state snapshots on demand. Keep
  both — pull for "what's MRR now", the stream for "every failed payment today".

---

## 13. Architectural decisions & tradeoffs (full matrix)

**Loop location.** *Host-driven (default):* observable, controllable, uses your own LLM/tool-call
loop; cost = tool results round-trip to host (mitigated by in-cell helpers + auto-offload).
*Sandbox-resident:* would keep everything in the VM, but **the docs say no autonomous-agent
abstraction exists and the loop belongs in the external app** — so this isn't actually offered;
the "sandbox-native" feel comes from the agent *acting through cells + helpers*, not from moving
the loop.

**Session strategy.** *One long-lived (default):* persistent mount + cheap reuse; cost = shared
interpreter state (handled by lock + fresh-workspace rule). *Per-run:* clean isolation; cost =
cold start every run **and a fresh empty mount** (loses data — disqualifying here). *Pooled:* warm
+ isolated; cost = complexity, and **needs a per-user mount** we don't have.

**Read-only.** *Account scopes (default, real boundary):* structural at the API; cost = must
connect read-scoped. *Denylist:* structural-ish; cost = enumerate every write tool, fragile.
*Prompt-only:* zero setup; cost = soft, model could be coaxed. (We use prompt + scopes.)

**Analytics location.** *Host in-process (default):* fast, no network, deterministic; the sandbox
stays the agent's domain. *Ship to sandbox:* keeps heavy data off host — but our deterministic job
is small, so it's pure latency + cold-start cost. (The *agent's* ad-hoc analysis still runs in the
sandbox — that's the point of cells.)

**Ingest.** *Background coalesced (default):* instant request, no stacking; cost = eventual
consistency (analytics catch up a beat later). *Synchronous:* simplest; cost = per-event latency,
timeouts once the cycle touches the network.

**Tool-call origin.** *Both, prefer in-cell (default):* data stays in the sandbox for fetch+compute;
`MULTI_EXECUTE` for simple reads. *Host-only:* simpler, but big results flood context.
*Cell-only:* maximal data locality, but overkill for one-off reads.

---

## 14. Pending / open questions

Resolved this round (kept for context): **mount is per-session** (confirmed); **read-only is
accepted as prompt-level** (paired with read-scoped accounts).

Still open:

1. **`invoke_llm` cost/billing model** — sandboxes aren't billed yet; once metered, what does an
   in-cell `invoke_llm` cost, and will we want to route it to our own keys/model? (Composio plans
   "preferred LLMs once billing lands.")
2. **`reasoning_effort` mapping** — which concrete model does each of low/medium/high map to, and
   can we pin it?
3. **Concurrency semantics if two cells *did* run in one session** — we avoid it with a lock, but
   the actual behavior (separate interpreters? shared globals? queueing?) is unconfirmed.
4. **Narrowing `session.tools()`** — can we expose fewer meta-tools (e.g. drop `MANAGE_CONNECTIONS`)
   to tighten the action space?
5. **`enable_auto_workbench_offload` thresholds** — at what response size does auto-offload kick in,
   and is it on by default for our session config?
6. **Cold-start / provisioning latency** — typical time to first cell on a warm vs cold session, to
   budget the loop and any user-facing timeouts.
7. **Mount consistency** — after a host `files.upload`, is the file immediately visible to an
   already-running sandbox cell, or is there propagation lag (matters for ingest→analyze races)?
