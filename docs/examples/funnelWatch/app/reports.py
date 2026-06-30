"""Hourly and daily reports composed from analytics snapshots (SaaS / Composio)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.volume import Volume

HOURLY = "reports/hourly_digest.md"
DAILY = "reports/daily_summary.md"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _blocks(volume: Volume) -> tuple[dict, dict]:
    return (volume.read_json("analytics/daily_metrics.json", {}),
            volume.read_json("analytics/plan_comparison.json", {}))


def build_hourly_digest(volume: Volume) -> str:
    daily, plans = _blocks(volume)
    insight_rows = volume.read_json("analytics/insights.json", {}).get("insights", [])[:3]
    insight_lines = [f"- {i.get('message', i.get('summary', ''))}" for i in insight_rows]
    text = "\n".join([
        "# Hourly Digest", f"_{_now()}_", "",
        f"- New MRR: ${daily.get('new_mrr', 0)}  (net ${daily.get('net_new_mrr', 0)})",
        f"- New subscriptions: {daily.get('new_subscriptions', 0)} · Churned: {daily.get('churned', 0)}",
        f"- Signups: {daily.get('signups', 0)} ({daily.get('signup_conv_pct', 0)}% of visits)",
        f"- Trial→paid: {daily.get('trial_conv_pct', 0)}% · Failed-payment rate: {daily.get('failed_rate_pct', 0)}%",
        "",
        f"**Plans:** {plans.get('summary', 'No new subscriptions yet.')}",
        "",
        "**Top insights**",
        *(insight_lines or ["- No material insight candidates yet."]),
        "",
        volume.read_text("analytics/anomaly_report.md", "").strip(),
    ]) + "\n"
    volume.write_text(HOURLY, text)
    return text


def build_daily_summary(volume: Volume, session_date: str) -> tuple[str, dict]:
    daily, plans = _blocks(volume)
    source_perf = volume.read_json("analytics/source_performance.json", {"sources": [], "campaigns": []})
    insight_rows = volume.read_json("analytics/insights.json", {}).get("insights", [])[:5]
    top = plans.get("plans", [])[:3]
    top_sources = source_perf.get("sources", [])[:5]
    text = "\n".join([
        f"# Daily Summary — {session_date}", f"_{_now()}_", "",
        f"- New MRR: ${daily.get('new_mrr', 0)} (net new ${daily.get('net_new_mrr', 0)})",
        f"- New subscriptions: {daily.get('new_subscriptions', 0)} · Churned: {daily.get('churned', 0)}",
        f"- Trials: {daily.get('trials', 0)} · Trial→paid: {daily.get('trial_conv_pct', 0)}%",
        f"- Visits: {daily.get('visits', 0)} · Signups: {daily.get('signups', 0)} "
        f"({daily.get('signup_conv_pct', 0)}%) · Activations: {daily.get('activations', 0)}",
        f"- Failed-payment rate: {daily.get('failed_rate_pct', 0)}%",
        "",
        "**New MRR by plan**",
        *[f"- {p['plan']}: ${p['new_mrr']} ({p['new_subscriptions']} new)" for p in top],
        "",
        "**Top sources**",
        *[f"- {s['source']}: {s['leads']} leads, {s['new_subscriptions']} paid, ${s['new_mrr']} new MRR"
          for s in top_sources],
        "",
        "**Top insights**",
        *([f"- {i.get('message', i.get('summary', ''))}" for i in insight_rows]
          or ["- No material insight candidates."]),
        "",
        volume.read_text("analytics/anomaly_report.md", "").strip(),
    ]) + "\n"
    volume.write_text(DAILY, text)

    compact = {
        "session_date": session_date,
        "new_mrr": daily.get("new_mrr", 0),
        "net_new_mrr": daily.get("net_new_mrr", 0),
        "new_subscriptions": daily.get("new_subscriptions", 0),
        "churned": daily.get("churned", 0),
        "trial_conv_pct": daily.get("trial_conv_pct", 0),
        "signups": daily.get("signups", 0),
        "signup_conv_pct": daily.get("signup_conv_pct", 0),
        "failed_rate_pct": daily.get("failed_rate_pct", 0),
        "leader": plans.get("leader"),
        "top_plans": top,
        "source_performance": {
            "sources": source_perf.get("sources", [])[:12],
            "campaigns": source_perf.get("campaigns", [])[:20],
        },
        "top_insights": insight_rows,
    }
    return text, compact
