"""Structured insight engine.

Analytics computes the numbers; this module detects business patterns worth
surfacing and writes compact insight objects into the session volume. The LLM is
used only to phrase those facts, not to invent the math.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from app import agent, slack
from app.volume import Volume

INSIGHTS = "analytics/insights.json"
STATE = "analytics/insight_state.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def evaluate(volume: Volume, *, emit: bool = False) -> list[dict]:
    perf = volume.read_json("analytics/source_performance.json", {})
    daily = volume.read_json("analytics/daily_metrics.json", {})
    previous = {
        i.get("id"): i.get("message")
        for i in volume.read_json(INSIGHTS, {}).get("insights", [])
        if i.get("id") and i.get("message")
    }
    candidates = []
    for row in perf.get("sources", []):
        candidates += _source_insights(row)
    candidates += _global_insights(daily)
    ranked = sorted(candidates, key=lambda x: x["score"], reverse=True)[:12]
    for insight in ranked:
        insight["id"] = _fingerprint(insight)
        insight["created_at"] = _now()
        insight["message"] = previous.get(insight["id"]) or agent.explain_insight(insight)
    if emit:
        _emit_new(volume, ranked)  # newly-fired insights get an agent-enriched message
    # Write after emit so enriched alert text is persisted for the dashboard too.
    volume.write_json(INSIGHTS, {"updated_at": _now(), "insights": ranked})
    return ranked


def _source_insights(row: dict) -> list[dict]:
    insights = []
    source = row.get("source", "unknown")
    baseline_days = row.get("baseline_days", 0)
    if baseline_days < 3:
        return insights

    lead_delta = row.get("leads_delta_pct")
    paid_delta = row.get("new_subscriptions_delta_pct")
    spend_delta = row.get("spend_delta_pct")
    leads = row.get("leads", 0)
    paid = row.get("new_subscriptions", 0)
    baseline_paid = row.get("baseline_new_subscriptions", 0)

    if lead_delta is not None and paid_delta is not None:
        paid_flat = abs(paid_delta) <= 8 or paid == round(baseline_paid)
        if leads >= 20 and lead_delta >= 25 and paid_flat:
            insights.append({
                "type": "lead_quality_mismatch",
                "severity": "high",
                "score": 95 + min(20, lead_delta / 4),
                "title": "Lead quality mismatch",
                "source": source,
                "summary": f"{source} leads are up {lead_delta}%, but paid conversions have not moved.",
                "recommendation": "Review targeting, offer, and landing-page fit before increasing spend.",
                "evidence": {
                    "today_leads": leads,
                    "baseline_leads": row.get("baseline_leads", 0),
                    "lead_delta_pct": lead_delta,
                    "today_paid": paid,
                    "baseline_paid": baseline_paid,
                    "paid_delta_pct": paid_delta,
                    "today_spend": row.get("spend", 0),
                    "baseline_spend": row.get("baseline_spend", 0),
                    "spend_delta_pct": spend_delta,
                    "lead_to_paid_pct": row.get("lead_to_paid_pct", 0),
                },
            })

    if spend_delta is not None and row.get("new_mrr_delta_pct") is not None:
        if row.get("spend", 0) >= 500 and spend_delta >= 20 and row["new_mrr_delta_pct"] <= 5:
            insights.append({
                "type": "spend_efficiency_drop",
                "severity": "medium",
                "score": 78 + min(15, spend_delta / 5),
                "title": "Spend is not translating into revenue",
                "source": source,
                "summary": f"{source} spend is up {spend_delta}%, while new MRR is only {row['new_mrr_delta_pct']}% vs baseline.",
                "recommendation": "Check campaign mix and conversion quality before scaling budget.",
                "evidence": {
                    "today_spend": row.get("spend", 0),
                    "baseline_spend": row.get("baseline_spend", 0),
                    "today_new_mrr": row.get("new_mrr", 0),
                    "baseline_new_mrr": row.get("baseline_new_mrr", 0),
                    "roas_proxy": row.get("roas_proxy"),
                },
            })

    if row.get("new_mrr_delta_pct") is not None and row.get("new_mrr_delta_pct") >= 25 and paid >= 3:
        insights.append({
            "type": "revenue_source_opportunity",
            "severity": "medium",
            "score": 70 + min(20, row["new_mrr_delta_pct"] / 5),
            "title": "Revenue source outperforming baseline",
            "source": source,
            "summary": f"{source} new MRR is up {row['new_mrr_delta_pct']}% vs the recent baseline.",
            "recommendation": "Inspect the winning campaign, segment, and landing path for repeatable patterns.",
            "evidence": {
                "today_new_mrr": row.get("new_mrr", 0),
                "baseline_new_mrr": row.get("baseline_new_mrr", 0),
                "today_paid": paid,
                "baseline_paid": baseline_paid,
            },
        })

    return insights


def _global_insights(daily: dict) -> list[dict]:
    insights = []
    failed = daily.get("failed_rate_pct", 0)
    if failed >= 5 and daily.get("invoice_attempts", 0) >= 120:
        insights.append({
            "type": "failed_payment_anomaly",
            "severity": "high",
            "score": 90 + failed,
            "title": "Failed payments crossed threshold",
            "source": "Stripe",
            "summary": f"Failed-payment rate is {failed}% across {daily.get('invoice_attempts', 0)} invoice attempts.",
            "recommendation": "Check billing provider status, card decline reasons, and plan concentration.",
            "evidence": {
                "failed_rate_pct": failed,
                "failed_payments": daily.get("failed_payments", 0),
                "invoice_attempts": daily.get("invoice_attempts", 0),
            },
        })
    return insights


def _emit_new(volume: Volume, insights: list[dict]) -> None:
    """Post every newly-surfaced insight to Slack — the dashboard feed mirrors the
    Slack channel, so all insights flow through here (dedup'd by fingerprint)."""
    state = volume.read_json(STATE, {"emitted": []})
    emitted = set(state.get("emitted", []))
    for insight in insights:
        if insight["id"] in emitted:
            continue
        # A monitor fired → let the agent loop enrich the alert with live context,
        # falling back to the already-phrased message offline.
        prompt = f"{insight['title']}: {insight.get('summary', '')}"
        insight["message"] = agent.enrich_alert(volume, prompt, {"insight": insight}, insight["message"])
        slack.send_internal_update(
            volume, insight["title"], insight["message"],
            kind="insight",
            meta={
                "severity": insight.get("severity"),
                "source": insight.get("source"),
                "type": insight.get("type"),
                "evidence": insight.get("evidence"),
            },
        )
        emitted.add(insight["id"])
    state["emitted"] = sorted(emitted)[-100:]
    state["updated_at"] = _now()
    volume.write_json(STATE, state)


def _fingerprint(insight: dict) -> str:
    raw = "|".join([
        insight.get("type", ""),
        insight.get("source", ""),
        str(insight.get("evidence", {}).get("lead_delta_pct", "")),
        str(insight.get("evidence", {}).get("paid_delta_pct", "")),
        str(insight.get("evidence", {}).get("failed_rate_pct", "")),
    ])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
