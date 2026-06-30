"""Agent reasoning layer — turns analytics + a monitor question into a short insight.

Uses the OpenAI Responses API. The prompt carries only compact analytics JSON (never
raw events), keeping heavy data out of model context. Falls back to a deterministic
template when no OpenAI key is configured, so the demo always produces an insight.
"""
from __future__ import annotations

import json
import threading

from app import interests, sandbox, schema
from app.composio_client import get_openai
from app.config import settings

SYSTEM = (
    "You are FunnelWatch, a read-only revenue and marketing analyst for an internal team. "
    "Given analytics data and a question, write a concise internal update (under 80 words): "
    "what changed, why it matters, and what to look at next. Use only the numbers provided; "
    "never invent data. You cannot take actions — you only observe and advise."
)


def generate_insight(question: str, context: dict, fallback: str) -> str:
    """Return a short internal-update string for the given monitor question."""
    client = get_openai()
    if client is None:
        return fallback
    try:
        resp = client.responses.create(
            model=settings.model,
            input=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content":
                    f"Question: {question}\n\nAnalytics JSON:\n{json.dumps(context, indent=2)}"},
            ],
        )
        text = getattr(resp, "output_text", None)
        if not text:
            text = _extract_text(resp)
        return (text or "").strip() or fallback
    except Exception:
        return fallback


INSIGHT_SYSTEM = (
    "You are FunnelWatch, a read-only revenue and marketing analyst. Turn the provided "
    "structured insight into a concise internal Slack update under 90 words. Use only "
    "the evidence provided. Explain what changed, why it matters, and what to inspect "
    "next. Do not suggest taking automated actions or changing budgets directly."
)


def explain_insight(insight: dict) -> str:
    """Phrase a structured insight. Falls back to a deterministic business summary."""
    fallback = _fallback_insight(insight)
    client = get_openai()
    if client is None:
        return fallback
    try:
        resp = client.responses.create(
            model=settings.model,
            input=[
                {"role": "system", "content": INSIGHT_SYSTEM},
                {"role": "user", "content": json.dumps(insight, indent=2)},
            ],
        )
        text = getattr(resp, "output_text", None) or _extract_text(resp)
        return (text or "").strip() or fallback
    except Exception:
        return fallback


CHAT_SYSTEM = (
    "You are FunnelWatch, a read-only growth analyst for Composio's team. Answer questions "
    "about today's metrics using ONLY the provided analytics JSON (MRR, funnel, plans, churn, "
    "failed payments, and button_clicks — instrumented clicks on named CTAs/buttons). When asked "
    "how many people clicked a specific button, read button_clicks.elements by name. For "
    "questions about earlier days or trends, use 'history' (prior daily summaries) and "
    "'saved_artifacts' (things previously saved). Be concise and specific with numbers. Answer in "
    "plain prose for a business audience — never show code, JSON, field names, or internal data "
    "paths. You observe and advise but take no actions. If the data doesn't contain the answer, "
    "say so."
)


def answer(question: str, context: dict) -> str:
    """Answer a chat question about today's data. Falls back to a rule-based reply."""
    client = get_openai()
    if client is None:
        return _fallback_answer(question, context)
    try:
        resp = client.responses.create(
            model=settings.model,
            input=[
                {"role": "system", "content": CHAT_SYSTEM},
                {"role": "user", "content":
                    f"Question: {question}\n\nAnalytics JSON:\n{json.dumps(context, indent=2)}"},
            ],
        )
        text = getattr(resp, "output_text", None) or _extract_text(resp)
        return (text or "").strip() or _fallback_answer(question, context)
    except Exception:
        return _fallback_answer(question, context)


MAX_AGENT_STEPS = 8

# One agent run uses the single shared sandbox session at a time — cells run in a persistent
# interpreter, so concurrent runs could clobber each other's state.
_agent_lock = threading.Lock()

AGENT_SYSTEM = (
    "You are FunnelWatch, a READ-ONLY revenue and marketing analyst for an internal team. "
    "Observe and advise only — never call a tool that writes, refunds, sends, or changes anything; "
    "only read data.\n\n"

    "HOW YOU WORK\n"
    "Your main tool is COMPOSIO_REMOTE_WORKBENCH: a persistent Python sandbox (pandas/numpy ready). "
    "You submit a cell of Python; it runs and prints output back to you. Do the real work there — "
    "fetch data, compute, print a SMALL result. Inside a cell these helpers are pre-loaded as "
    "globals (do NOT import them; do NOT call COMPOSIO_* meta-tools from a cell). Each returns an "
    "(result, error) tuple — check error first, then parse:\n"
    "  run_composio_tool(tool_slug, arguments, print_schema_for_tool=False) -> (result, error)\n"
    "      Run a READ tool (STRIPE_*, HUBSPOT_*, …). result['data'] holds the payload; parse "
    "defensively. Pass print_schema_for_tool=True to print a tool's input schema first.\n"
    "  invoke_llm(query, reasoning_effort=None) -> (text, error)  # summarize/classify/extract; <=200k chars\n"
    "  web_search(query) -> (text, error)\n"
    "  proxy_execute(method, endpoint, toolkit, query_params=None, body=None, headers=None) -> (data, error)\n"
    "  smart_file_extract(path) -> (text, error);  upload_local_file(*paths) -> (info, error)\n"
    "  get_mount_file_url(path) -> (url, error)  # shareable download link for a /mnt/files file\n\n"

    "DATA\n"
    "Pre-ingested event history is on the mount at context['workspace_path']; read it from cell "
    "code. Layout:\n" + schema.prompt_layout() + "\n"
    "If the precomputed analytics already in the context answer the question, just answer — don't "
    "open the workbench.\n\n"

    "SANDBOX RULES\n"
    "- /mnt/files is a network (FUSE) mount: fine for reading the JSONL and writing small results, "
    "but do heavy processing in /tmp and copy outputs back.\n"
    "- Each cell has a ~3-minute limit; if you make many tool calls, parallelize them "
    "(concurrent.futures) to finish in time.\n"
    "- Treat each task as a FRESH workspace — define what you need; don't rely on variables left by "
    "a previous task.\n"
    "- Discovery: SEARCH_TOOLS finds a slug; print_schema_for_tool=True shows its arguments. "
    "COMPOSIO_MULTI_EXECUTE_TOOL is fine for one simple read.\n\n"

    "When finished, reply with the answer in concise plain prose for a business audience — no code, "
    "JSON, or field names."
)


def run_agent(question: str, context: dict) -> str | None:
    """Drive the Composio tool-router agent loop: the model searches tools, calls simple ones
    directly, and runs Python in the workbench, iterating until it answers. Returns the final
    prose, or None if the sandbox/LLM is unavailable or the loop doesn't converge."""
    client = get_openai()
    session = sandbox.session()
    if client is None or session is None:
        return None

    # Serialize: only one run drives the shared session (and its persistent interpreter) at a time.
    with _agent_lock:
        try:
            tools = session.tools()
        except Exception:
            return None
        messages = [
            {"role": "system", "content": AGENT_SYSTEM},
            {"role": "user", "content":
                f"{question}\n\nPrecomputed context (today's analytics + recent history):\n"
                f"{json.dumps(context, default=str)[:8000]}"},
        ]
        for _ in range(MAX_AGENT_STEPS):
            try:
                resp = client.responses.create(model=settings.model, tools=tools, input=messages)
            except Exception:
                return None
            calls = [it for it in (getattr(resp, "output", None) or [])
                     if getattr(it, "type", None) == "function_call"]
            if not calls:  # no more tool calls → the model has its answer
                return (getattr(resp, "output_text", None) or _extract_text(resp) or "").strip() or None
            messages += resp.output  # carry the assistant's tool calls into the next turn
            for call in calls:
                messages.append({"type": "function_call_output",
                                 "call_id": call.call_id, "output": _tool_output(call)})
        return None  # step budget exhausted


def _tool_output(call) -> str:
    """Execute one tool call via the session and serialise the result for the model."""
    try:
        args = json.loads(call.arguments or "{}")
    except Exception:
        args = {}
    try:
        result = sandbox.execute(call.name, args)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": str(exc)})
    if result["error"]:
        return json.dumps({"error": str(result["error"])})[:8000]
    try:
        return json.dumps(result["data"], default=str)[:12000]
    except Exception:
        return str(result["data"])[:12000]


def _with_workspace(volume, context: dict) -> dict:
    """Tell the agent where its mount data is (MountVolume → today's subtree path)."""
    prefix = getattr(volume, "mount_prefix", None)
    return {**context, "workspace_path": f"/mnt/files/{prefix}"} if prefix else context


def deep_answer(volume, question: str, context: dict) -> str:
    """Answer a chat question via the agent loop (sandbox), falling back to the rule-based
    answer when the sandbox/LLM is unavailable or the loop can't finish."""
    interests.record(question)  # learn what the user asks about, to target future enrichment
    return run_agent(question, _with_workspace(volume, context)) or answer(question, context)


ALERT_TASK = (
    "An internal monitor fired. Write a concise internal alert (under 90 words): what changed, "
    "why it matters, and what to check next. The context includes 'user_interests' (the topics "
    "this team asks about most) — let it guide which extra detail is worth surfacing. Pull current "
    "external detail via tools ONLY if it makes the alert more actionable; otherwise answer from "
    "the provided context. Use only real data — never invent numbers."
)


def enrich_alert(volume, prompt: str, context: dict, fallback: str) -> str:
    """Compose a fired-monitor alert via the agent loop — it may pull live context through
    tools to explain *why it matters* — falling back to the deterministic text offline.

    The agent first consults the user's interest profile so it targets relevant context."""
    ctx = {**context, "user_interests": interests.profile()}
    task = f"{ALERT_TASK}\n\nWhat fired: {prompt}"
    return run_agent(task, _with_workspace(volume, ctx)) or fallback


def _fallback_answer(question: str, context: dict) -> str:
    q = (question or "").lower()
    d = context.get("daily_metrics", {})
    plans = context.get("plan_comparison", {})
    funnel = context.get("funnel", {})
    clicks = context.get("button_clicks", {})

    def has(*words):
        return any(w in q for w in words)

    # button / CTA click questions ("how many clicked the Get Paid button?")
    elements = clicks.get("elements", [])
    for e in elements:
        if e["name"].lower() in q:
            return (f'{e["clicks"]} visitors clicked the "{e["name"]}" button today '
                    f'(of {clicks.get("total_clicks", 0)} tracked button clicks).')
    if has("click", "button", "cta"):
        if not elements:
            return "No button clicks have been tracked yet today."
        top = ", ".join(f'{e["name"]} ({e["clicks"]})' for e in elements[:6])
        return f"Tracked button clicks today ({clicks.get('total_clicks', 0)} total): {top}."

    if has("mrr", "revenue", "money"):
        return (f"New MRR today is ${d.get('new_mrr', 0)} (net ${d.get('net_new_mrr', 0)}) from "
                f"{d.get('new_subscriptions', 0)} new subscriptions. {plans.get('summary', '')}").strip()
    if has("plan", "tier", "starter", "pro", "enterprise"):
        rows = "; ".join(f"{p['plan']} ${p['new_mrr']} ({p['new_subscriptions']} new)"
                         for p in plans.get("plans", []))
        return plans.get("summary", "") + (f" Breakdown — {rows}." if rows else "")
    if has("fail", "payment", "decline"):
        return f"Failed-payment rate is {d.get('failed_rate_pct', 0)}% across {d.get('invoice_attempts', 0)} invoice attempts today."
    if has("churn", "cancel"):
        return f"{d.get('churned', 0)} cancellations today (${d.get('churned_mrr', 0)} lost MRR); net new MRR is ${d.get('net_new_mrr', 0)}."
    if has("trial"):
        return f"Trial→paid conversion is {d.get('trial_conv_pct', 0)}% ({d.get('trials', 0)} trials started, {d.get('new_subscriptions', 0)} converted)."
    if has("activat"):
        return f"Activation rate is {d.get('activation_rate_pct', 0)}% of signups."
    if has("signup", "convert", "conversion", "funnel", "visit", "traffic"):
        stages = " → ".join(f"{s['name']} {s['count']}" for s in funnel.get("stages", []))
        return (f"Today's funnel: {stages}. Visit→signup {d.get('signup_conv_pct', 0)}%, "
                f"signup→activation {d.get('activation_rate_pct', 0)}%, trial→paid {d.get('trial_conv_pct', 0)}%.")
    return (f"Today: ${d.get('new_mrr', 0)} new MRR, {d.get('signups', 0)} signups "
            f"({d.get('signup_conv_pct', 0)}% of visits), {d.get('failed_rate_pct', 0)}% failed payments. "
            f"Ask about MRR, plans, churn, trials, activation, or the funnel. "
            f"(Set OPENAI_API_KEY for open-ended answers.)")


def _fallback_insight(insight: dict) -> str:
    source = insight.get("source", "This source")
    summary = insight.get("summary", "")
    rec = insight.get("recommendation", "Inspect the contributing metrics before making changes.")
    ev = insight.get("evidence", {})
    if insight.get("type") == "lead_quality_mismatch":
        return (
            f"{source} is generating more leads without downstream revenue movement. "
            f"Leads are up {ev.get('lead_delta_pct')}% ({ev.get('today_leads')} vs "
            f"{ev.get('baseline_leads')} baseline), while paid conversions are "
            f"{ev.get('today_paid')} vs {ev.get('baseline_paid')} baseline. "
            f"This looks like a lead-quality or landing-page-fit issue, not a budget opportunity. {rec}"
        )
    if summary:
        return f"{summary} {rec}"
    return rec


def _extract_text(resp) -> str:
    parts = []
    for item in getattr(resp, "output", []) or []:
        if getattr(item, "type", None) == "message":
            for c in getattr(item, "content", []) or []:
                t = getattr(c, "text", None)
                if t:
                    parts.append(t)
    return "\n".join(parts)
