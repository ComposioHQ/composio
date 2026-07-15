"""Self-contained analytics job — the single source of the analytics computation.

Runs two ways from the *same* code:
  * in-process as the offline fallback (imported by app.analytics), and
  * inside the Composio workbench sandbox, where it is shipped to the mount and
    executed as ``python analytics_job.py <base_dir>`` over ``/mnt/files/{date}/``.

Because it must run inside the sandbox VM, it imports nothing from ``app`` — it reads
and writes plain files under ``<base>/`` and takes baseline history as an injected
list (durable summaries staged to ``<base>/durable/recent.json`` by the host).

Reads   <base>/normalized/*.jsonl, <base>/durable/recent.json
Writes  <base>/analytics/daily_metrics.json, plan_comparison.json, funnel.json,
        clicks.json, source_performance.json, source_health.json, anomaly_report.md
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SUBSCRIPTION_EVENTS = "normalized/subscription_events.jsonl"
FUNNEL_EVENTS = "normalized/funnel_events.jsonl"
LEAD_EVENTS = "normalized/lead_events.jsonl"
AD_EVENTS = "normalized/ad_events.jsonl"
RECENT_SUMMARIES = "durable/recent.json"
DAILY_METRICS = "analytics/daily_metrics.json"
PLAN_COMPARISON = "analytics/plan_comparison.json"
FUNNEL = "analytics/funnel.json"
CLICKS = "analytics/clicks.json"
SOURCE_PERFORMANCE = "analytics/source_performance.json"
SOURCE_HEALTH = "analytics/source_health.json"
ANOMALY_REPORT = "analytics/anomaly_report.md"

PAID_PLANS = ["Starter", "Pro", "Enterprise"]


# --- plain-file IO (no Volume dependency) ---
def _read_jsonl(p: Path) -> list[dict]:
    if not p.exists():
        return []
    with p.open("r", encoding="utf-8") as f:
        return [json.loads(ln) for ln in f if ln.strip()]


def _write_json(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")


def _write_text(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rate(num: int, den: int) -> float:
    return round(100.0 * num / den, 1) if den else 0.0


def run(base: Path, recent_summaries: list[dict] | None = None) -> dict:
    """Compute analytics over <base>/ and write snapshots into <base>/analytics/."""
    base = Path(base)
    recent = recent_summaries if recent_summaries is not None else _load_recent(base)

    subs = _read_jsonl(base / SUBSCRIPTION_EVENTS)
    funnel = _read_jsonl(base / FUNNEL_EVENTS)
    leads = _read_jsonl(base / LEAD_EVENTS)
    ads = _read_jsonl(base / AD_EVENTS)

    s = pd.DataFrame(subs) if subs else pd.DataFrame(columns=["type", "plan", "mrr_cents", "source", "campaign"])
    f = pd.DataFrame(funnel) if funnel else pd.DataFrame(columns=["type", "source", "campaign"])
    l = pd.DataFrame(leads) if leads else pd.DataFrame(columns=["type", "source", "campaign", "value_cents"])
    a = pd.DataFrame(ads) if ads else pd.DataFrame(columns=["type", "source", "campaign", "spend_cents", "clicks", "impressions"])
    for df in (s, f, l, a):
        _ensure_cols(df, ["source", "campaign"])

    def stype(t):
        return s[s.type == t] if len(s) else s

    trials = stype("trial_started")
    new = stype("subscription_started")
    churn = stype("subscription_churned")
    failed = stype("payment_failed")
    succeeded = stype("payment_succeeded")

    new_mrr_cents = int(new.mrr_cents.sum()) if len(new) else 0
    churned_mrr_cents = int(churn.mrr_cents.sum()) if len(churn) else 0

    visits = int((f.type == "visit").sum()) if len(f) else 0
    signups = int((f.type == "signup").sum()) if len(f) else 0
    activations = int((f.type == "activation").sum()) if len(f) else 0

    daily = {
        "updated_at": _now(),
        "events": int(len(s) + len(f) + len(l) + len(a)),
        # acquisition funnel
        "visits": visits,
        "signups": signups,
        "activations": activations,
        "signup_conv_pct": _rate(signups, visits),
        "activation_rate_pct": _rate(activations, signups),
        # subscriptions / revenue
        "trials": int(len(trials)),
        "new_subscriptions": int(len(new)),
        "churned": int(len(churn)),
        "failed_payments": int(len(failed)),
        "invoice_attempts": int(len(succeeded) + len(failed)),
        "trial_conv_pct": _rate(len(new), len(trials)),
        # failed-payment rate = failed invoices / all invoice attempts
        "failed_rate_pct": _rate(len(failed), len(succeeded) + len(failed)),
        "new_mrr_cents": new_mrr_cents,
        "new_mrr": round(new_mrr_cents / 100, 2),
        "churned_mrr": round(churned_mrr_cents / 100, 2),
        "net_new_mrr": round((new_mrr_cents - churned_mrr_cents) / 100, 2),
    }
    _write_json(base / DAILY_METRICS, daily)

    _plan_comparison(base, s, new, churn)
    _funnel(base, daily)
    _clicks(base, f)
    _source_performance(base, s, f, l, a, recent)
    _source_health(base, subs, funnel, leads, ads)
    _anomaly_report(base, daily)
    return daily


def _load_recent(base: Path) -> list[dict]:
    p = base / RECENT_SUMMARIES
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("summaries", [])
    except Exception:
        return []


def _ensure_cols(df: pd.DataFrame, cols: list[str]) -> None:
    for col in cols:
        if col not in df.columns:
            df[col] = "unknown" if col == "source" else "unattributed"
        df[col] = df[col].fillna("unknown" if col == "source" else "unattributed")


def _clicks(base, f) -> None:
    """Aggregate instrumented CTA/button click events by element."""
    elements = []
    if len(f) and "element" in f.columns:
        counts = f[f.type == "click"].element.value_counts()
        elements = [{"name": str(k), "clicks": int(v)} for k, v in counts.items()]
    total = sum(e["clicks"] for e in elements)
    _write_json(base / CLICKS, {"updated_at": _now(), "total_clicks": total, "elements": elements})


def _source_performance(base, s, f, l, a, recent) -> None:
    """Aggregate today's acquisition/revenue by source and campaign, then attach baselines."""
    source_rows = _performance_rows(s, f, l, a, ["source"])
    campaign_rows = _performance_rows(s, f, l, a, ["source", "campaign"])
    source_baselines = _baseline_rows(recent, "sources")
    campaign_baselines = _baseline_rows(recent, "campaigns")

    for row in source_rows:
        _attach_baseline(row, source_baselines.get(row["source"], {}))
    for row in campaign_rows:
        key = f"{row['source']}::{row['campaign']}"
        _attach_baseline(row, campaign_baselines.get(key, {}))

    source_rows.sort(key=lambda r: (r["new_mrr"], r["leads"], r["signups"]), reverse=True)
    campaign_rows.sort(key=lambda r: (r["new_mrr"], r["leads"], r["spend"]), reverse=True)
    _write_json(base / SOURCE_PERFORMANCE, {
        "updated_at": _now(),
        "baseline_days": len(recent),
        "sources": source_rows,
        "campaigns": campaign_rows,
    })


def _performance_rows(s, f, l, a, keys: list[str]) -> list[dict]:
    groups = set()
    for df in (s, f, l, a):
        if len(df):
            groups.update(tuple(str(row[k]) for k in keys) for _, row in df[keys].drop_duplicates().iterrows())
    rows = []
    for group in sorted(groups):
        masks = []
        for df in (s, f, l, a):
            if len(df):
                mask = pd.Series(True, index=df.index)
                for k, v in zip(keys, group):
                    mask &= df[k].astype(str) == v
            else:
                mask = pd.Series(False, dtype=bool)
            masks.append(mask)
        sm, fm, lm, am = masks
        ss = s[sm] if len(s) else s
        ff = f[fm] if len(f) else f
        ll = l[lm] if len(l) else l
        aa = a[am] if len(a) else a
        trials = int((ss.type == "trial_started").sum()) if len(ss) else 0
        paid = ss[ss.type == "subscription_started"] if len(ss) else ss
        paid_count = int(len(paid))
        new_mrr_cents = int(paid.mrr_cents.sum()) if len(paid) else 0
        spend_cents = int(aa.spend_cents.sum()) if len(aa) else 0
        leads = int((ll.type == "lead_created").sum()) if len(ll) else 0
        signups = int((ff.type == "signup").sum()) if len(ff) else 0
        visits = int((ff.type == "visit").sum()) if len(ff) else 0
        activations = int((ff.type == "activation").sum()) if len(ff) else 0
        row = {
            "source": group[0],
            "visits": visits,
            "signups": signups,
            "activations": activations,
            "leads": leads,
            "trials": trials,
            "new_subscriptions": paid_count,
            "new_mrr": round(new_mrr_cents / 100, 2),
            "new_mrr_cents": new_mrr_cents,
            "spend": round(spend_cents / 100, 2),
            "spend_cents": spend_cents,
            "ad_clicks": int(aa.clicks.sum()) if len(aa) else 0,
            "impressions": int(aa.impressions.sum()) if len(aa) else 0,
            "signup_conv_pct": _rate(signups, visits),
            "activation_rate_pct": _rate(activations, signups),
            "lead_to_paid_pct": _rate(paid_count, leads),
            "trial_conv_pct": _rate(paid_count, trials),
            "roas_proxy": round(new_mrr_cents / spend_cents, 2) if spend_cents else None,
            "cac_proxy": round(spend_cents / 100 / paid_count, 2) if paid_count else None,
        }
        if len(keys) > 1:
            row["campaign"] = group[1]
        rows.append(row)
    return rows


def _baseline_rows(recent: list[dict], level: str) -> dict[str, dict]:
    acc: dict[str, dict] = {}
    for summary in recent:
        perf = summary.get("source_performance", {})
        rows = perf.get(level, [])
        for row in rows:
            key = row.get("source", "unknown")
            if level == "campaigns":
                key = f"{row.get('source', 'unknown')}::{row.get('campaign', 'unattributed')}"
            bucket = acc.setdefault(key, {"days": 0, "leads": 0, "new_subscriptions": 0,
                                          "new_mrr": 0.0, "spend": 0.0, "signups": 0})
            bucket["days"] += 1
            for metric in ("leads", "new_subscriptions", "new_mrr", "spend", "signups"):
                bucket[metric] += row.get(metric, 0) or 0
    for bucket in acc.values():
        days = max(1, bucket["days"])
        for metric in ("leads", "new_subscriptions", "new_mrr", "spend", "signups"):
            bucket[f"avg_{metric}"] = round(bucket[metric] / days, 2)
    return acc


def _attach_baseline(row: dict, baseline: dict) -> None:
    row["baseline_days"] = baseline.get("days", 0)
    for metric in ("leads", "new_subscriptions", "new_mrr", "spend", "signups"):
        avg = baseline.get(f"avg_{metric}", 0)
        row[f"baseline_{metric}"] = avg
        row[f"{metric}_delta_pct"] = _delta_pct(row.get(metric, 0), avg)


def _delta_pct(current: float, baseline: float):
    if not baseline:
        return None
    return round(100.0 * (current - baseline) / baseline, 1)


def _source_health(base, subs, funnel, leads, ads) -> None:
    streams = [
        ("Stripe", "stripe", subs),
        ("PostHog", "posthog", funnel),
        ("HubSpot", "hubspot", leads),
        ("Ads", "ads", ads),
    ]
    rows = []
    for name, key, events in streams:
        last = None
        if events:
            last = events[-1].get("ts") or events[-1].get("created") or events[-1].get("timestamp")
        rows.append({
            "key": key,
            "name": name,
            "events": len(events),
            "last_event_at": last,
            "status": "live" if events else "waiting",
        })
    _write_json(base / SOURCE_HEALTH, {"updated_at": _now(), "sources": rows})


def _plan_comparison(base, s, new, churn) -> None:
    plans = []
    present = sorted(set(s.plan.unique()) & set(PAID_PLANS)) if len(s) else []
    for plan in present:
        p_new = new[new.plan == plan] if len(new) else new
        p_churn = churn[churn.plan == plan] if len(churn) else churn
        mrr_cents = int(p_new.mrr_cents.sum()) if len(p_new) else 0
        plans.append({
            "plan": plan,
            "new_subscriptions": int(len(p_new)),
            "new_mrr": round(mrr_cents / 100, 2),
            "new_mrr_cents": mrr_cents,
            "churned": int(len(p_churn)),
        })
    plans.sort(key=lambda x: x["new_mrr_cents"], reverse=True)
    leader = plans[0]["plan"] if plans and plans[0]["new_mrr_cents"] else None

    summary = "No new subscriptions yet today."
    if plans and plans[0]["new_mrr_cents"]:
        a = plans[0]
        tail = f" vs {plans[1]['plan']} (${plans[1]['new_mrr']})" if len(plans) > 1 else ""
        summary = (f"{a['plan']} is driving the most new MRR today: ${a['new_mrr']} "
                   f"across {a['new_subscriptions']} new subscriptions{tail}.")
    _write_json(base / PLAN_COMPARISON, {"updated_at": _now(), "plans": plans,
                                         "leader": leader, "summary": summary})


def _funnel(base, daily) -> None:
    stages = [
        {"name": "Visits", "count": daily["visits"], "conv_pct": None},
        {"name": "Signups", "count": daily["signups"], "conv_pct": daily["signup_conv_pct"]},
        {"name": "Activations", "count": daily["activations"], "conv_pct": daily["activation_rate_pct"]},
        {"name": "Paid", "count": daily["new_subscriptions"],
         "conv_pct": _rate(daily["new_subscriptions"], daily["activations"])},
    ]
    _write_json(base / FUNNEL, {"updated_at": _now(), "stages": stages})


def _anomaly_report(base, daily) -> None:
    lines = ["# Anomaly Report", f"_Updated {daily['updated_at']}_", ""]
    flags = []
    if daily["failed_rate_pct"] >= 5.0:
        flags.append(f"- Failed-payment rate is **{daily['failed_rate_pct']}%** (>= 5% threshold).")
    if daily["churned"] and daily["churned"] >= max(3, daily["new_subscriptions"]):
        flags.append(f"- Churn ({daily['churned']}) is outpacing new subscriptions ({daily['new_subscriptions']}).")
    if daily["visits"] >= 50 and daily["signup_conv_pct"] < 2.0:
        flags.append(f"- Signup conversion is low at **{daily['signup_conv_pct']}%**.")
    if daily["trials"] >= 5 and daily["trial_conv_pct"] < 20.0:
        flags.append(f"- Trial→paid conversion is weak at **{daily['trial_conv_pct']}%**.")
    lines += flags or ["No anomalies detected."]
    _write_text(base / ANOMALY_REPORT, "\n".join(lines) + "\n")


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    result = run(target)
    # stdout is captured by the host to confirm success and surface key metrics.
    print(json.dumps(result))
