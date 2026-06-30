"""Monitors — default + custom business questions evaluated on a frequency.

Persisted to monitors.json at the project root (they outlive a session). SaaS slice
(Composio) ships two working evaluators — plan-mix / new-MRR comparison and a
failed-payment threshold; the other defaults are seeded as listed-but-unwired entries.
Custom monitors run the agent over current analytics and post an internal insight.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app import agent, slack
from app.config import settings
from app.volume import Volume

RECOMMENDATIONS = "analytics/recommendations.md"
STATE_FILE = "analytics/monitor_state.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _monitor(name, question, *, kind=None, frequency="hourly", threshold=None,
             sources=("stripe",), enabled=True):
    return {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "question": question,
        "data_sources": list(sources),
        "frequency": frequency,
        "slack_channel": settings.slack_channel,
        "threshold": threshold,
        "kind": kind,
        "enabled": enabled,
    }


def default_monitors() -> list[dict]:
    return [
        _monitor("Plan mix & new MRR", "Which plan is driving the most new MRR today?",
                 kind="plan_comparison", frequency="hourly", sources=("stripe",)),
        _monitor("Failed payment rate", "Alert me if failed payments go above 5%.",
                 kind="failed_payments_threshold", frequency="real-time", threshold=5.0, sources=("stripe",)),
        # Remaining SaaS defaults — listed and ready to wire (no evaluator yet).
        _monitor("Trial-to-paid conversion", "How is trial-to-paid conversion trending?", frequency="daily"),
        _monitor("Net new MRR", "What is net new MRR today (new minus churn)?", frequency="daily"),
        _monitor("Churn spike", "Are cancellations spiking?", frequency="hourly"),
        _monitor("Signup conversion rate", "Is signup conversion dropping?", sources=("posthog",)),
        _monitor("Activation rate", "Are new signups activating (first tool call)?", sources=("posthog",)),
        _monitor("Top acquisition source", "Which source drives the most signups?", sources=("posthog",)),
        _monitor("Paid vs organic efficiency", "Do paid sources convert better than organic?", sources=("posthog", "stripe")),
        _monitor("Enterprise vs SMB", "Do Enterprise trials convert better than Starter/Pro?", sources=("stripe",)),
        _monitor("Lead volume vs signups", "How do leads compare to signups?", sources=("hubspot",)),
        _monitor("Ad spend vs new MRR", "How does ad spend compare to new MRR?", sources=("googleads",)),
    ]


# --- persistence / CRUD ---
def load_monitors() -> list[dict]:
    if not settings.monitors_file.exists():
        save_monitors(default_monitors())
    return json.loads(settings.monitors_file.read_text(encoding="utf-8"))


def save_monitors(monitors: list[dict]) -> None:
    settings.monitors_file.write_text(json.dumps(monitors, indent=2), encoding="utf-8")


def _derive_name(question: str) -> str:
    """Short label for a custom alert, derived from its query."""
    q = " ".join((question or "").split())
    if not q:
        return "Custom alert"
    label = q[:46].rstrip() + ("…" if len(q) > 46 else "")
    return label[0].upper() + label[1:]


def add_monitor(data: dict) -> dict:
    monitors = load_monitors()
    question = data.get("question", "")
    m = _monitor(
        data.get("name") or _derive_name(question),
        question,
        kind="custom",
        frequency=data.get("frequency", "hourly"),
        threshold=data.get("threshold"),
        sources=data.get("data_sources", ["stripe"]),
        enabled=data.get("enabled", True),
    )
    if data.get("slack_channel"):
        m["slack_channel"] = data["slack_channel"]
    monitors.append(m)
    save_monitors(monitors)
    return m


def update_monitor(monitor_id: str, patch: dict) -> dict | None:
    monitors = load_monitors()
    for m in monitors:
        if m["id"] == monitor_id:
            m.update({k: v for k, v in patch.items() if k in m})
            save_monitors(monitors)
            return m
    return None


def delete_monitor(monitor_id: str) -> bool:
    monitors = load_monitors()
    kept = [m for m in monitors if m["id"] != monitor_id]
    if len(kept) == len(monitors):
        return False
    save_monitors(kept)
    return True


# --- evaluation ---
def evaluate(volume: Volume, frequency: str) -> list[str]:
    """Evaluate enabled monitors matching `frequency`. Returns names that fired."""
    context = {
        "daily_metrics": volume.read_json("analytics/daily_metrics.json", {}),
        "plan_comparison": volume.read_json("analytics/plan_comparison.json", {}),
        "funnel": volume.read_json("analytics/funnel.json", {}),
        "source_performance": volume.read_json("analytics/source_performance.json", {}),
        "insights": volume.read_json("analytics/insights.json", {}),
    }
    state = volume.read_json(STATE_FILE, {})
    fired = []
    for m in load_monitors():
        if not m.get("enabled") or m.get("frequency") != frequency:
            continue
        if _dispatch(volume, m, context, state):
            fired.append(m["name"])
    volume.write_json(STATE_FILE, state)
    return fired


def _dispatch(volume, m, context, state) -> bool:
    kind = m.get("kind")
    if kind == "failed_payments_threshold":
        return _eval_threshold(volume, m, context, state)
    if kind in ("plan_comparison", "custom"):
        return _eval_insight(volume, m, context)
    return False  # listed-but-unwired defaults


def _eval_threshold(volume, m, context, state) -> bool:
    daily = context["daily_metrics"]
    rate = float(daily.get("failed_rate_pct", 0.0))
    threshold = float(m.get("threshold") or 5.0)
    # Noise floor: also require a meaningful absolute number of failed payments, so a
    # brief excursion above the rate on low volume doesn't alert (a healthy day tops out
    # at a handful of failures; a real spike produces dozens).
    enough = daily.get("failed_payments", 0) >= 12
    was = state.get(m["id"], {}).get("breached", False)

    # Hysteresis: stay "breached" until the rate recovers a full point below the
    # threshold, so a rate hovering near it doesn't re-fire the alert repeatedly.
    if was:
        breached = rate >= threshold - 1.0
    else:
        breached = rate >= threshold and enough

    state[m["id"]] = {"breached": breached, "rate": rate, "checked_at": _now()}
    if breached and not was:  # fire only on a fresh transition into breach
        fallback = (f"Failed payments crossed your {threshold:.0f}% threshold. "
                    f"Current rate: {rate}%. New subscriptions today: {daily.get('new_subscriptions', 0)}.")
        text = agent.enrich_alert(volume, m["question"], context, fallback)
        _emit(volume, m, "Anomaly Alert", text, kind="alert")
        return True
    return False


def _eval_insight(volume, m, context) -> bool:
    plans = context["plan_comparison"]
    daily = context["daily_metrics"]
    fallback = plans.get("summary") or (
        f"New MRR ${daily.get('new_mrr', 0)} from {daily.get('new_subscriptions', 0)} new subscriptions today.")
    text = agent.enrich_alert(volume, m["question"], context, fallback)
    title = "MRR Update" if m.get("kind") == "plan_comparison" else f"Monitor: {m['name']}"
    _emit(volume, m, title, text)
    return True


def _emit(volume, m, title, text, kind="monitor") -> None:
    slack.send_internal_update(volume, title, text, channel=m.get("slack_channel"), kind=kind)
    section = f"\n## {title} — {m['name']}\n_{_now()}_\n\n{text}\n"
    volume.write_text(RECOMMENDATIONS, volume.read_text(RECOMMENDATIONS,
                      "# Recommendations\n") + section)
